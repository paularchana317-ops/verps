const { pool } = require('../config/db');
const { isMongoConnected } = require('../config/mongodb');
const Evaluation = require('../models/Evaluation');
const Recommendation = require('../models/Recommendation');
const Vendor = require('../models/Vendor');

/**
 * Scoring Weights for VEPRS (Sprint 3)
 * Price: 40% (0.40) - Price competitiveness
 * Quality: 35% (0.35) - Quality, specifications, reliability
 * Delivery: 25% (0.25) - Fulfillment speed, lead time, on-time delivery
 * Total: 100%
 */
const SCORING_WEIGHTS = {
  price: 0.40,
  quality: 0.35,
  delivery: 0.25
};

/**
 * Calculate overall evaluation score based on weighted formula
 * Formula: (Price * 0.40) + (Quality * 0.35) + (Delivery * 0.25)
 * @param {number} priceScore 
 * @param {number} qualityScore 
 * @param {number} deliveryScore 
 * @returns {number}
 */
function calculateOverallScore(priceScore, qualityScore, deliveryScore) {
  const p = parseFloat(priceScore) || 0;
  const q = parseFloat(qualityScore) || 0;
  const d = parseFloat(deliveryScore) || 0;
  const rawScore = (p * SCORING_WEIGHTS.price) + (q * SCORING_WEIGHTS.quality) + (d * SCORING_WEIGHTS.delivery);
  return Math.round(rawScore * 10) / 10;
}

/**
 * Generate Next Unique Evaluation ID (e.g. EVAL-1001, EVAL-1002, ...)
 * @param {object} connection 
 * @returns {Promise<string>}
 */
async function generateEvaluationId(connection) {
  const [rows] = await connection.query(
    'SELECT evaluation_id FROM evaluations ORDER BY id DESC LIMIT 1'
  );

  let nextSeq = 1001;
  if (rows.length > 0 && rows[0].evaluation_id) {
    const match = rows[0].evaluation_id.match(/EVAL-(\d+)/i);
    if (match && match[1]) {
      const currentNumber = parseInt(match[1], 10);
      if (!isNaN(currentNumber)) {
        nextSeq = Math.max(nextSeq, currentNumber + 1);
      }
    }
  }

  return `EVAL-${nextSeq}`;
}

/**
 * Generate Next Unique Recommendation ID (e.g. REC-1001)
 * @param {object} connection 
 * @returns {Promise<string>}
 */
async function generateRecommendationId(connection) {
  const [rows] = await connection.query(
    'SELECT recommendation_id FROM recommendations ORDER BY id DESC LIMIT 1'
  );

  let nextSeq = 1001;
  if (rows.length > 0 && rows[0].recommendation_id) {
    const match = rows[0].recommendation_id.match(/REC-(\d+)/i);
    if (match && match[1]) {
      const currentNumber = parseInt(match[1], 10);
      if (!isNaN(currentNumber)) {
        nextSeq = Math.max(nextSeq, currentNumber + 1);
      }
    }
  }

  return `REC-${nextSeq}`;
}

/**
 * Recompute and synchronize recommendations table and MongoDB whenever evaluation data changes.
 * Tie-breaking rules:
 * 1. Higher Quality Score
 * 2. Higher Delivery Score
 * 3. Higher Price Score
 */
async function syncRecommendations() {
  try {
    // 1. Fetch latest evaluation per vendor from SQL database
    const [evalRows] = await pool.query(`
      SELECT 
        e.id AS eval_id,
        e.evaluation_id,
        e.vendor_id,
        e.vendor_code,
        e.vendor_name,
        e.price_score,
        e.quality_score,
        e.delivery_score,
        e.overall_score,
        e.feedback,
        v.product_categories,
        v.city,
        v.state,
        v.status AS vendor_status
      FROM evaluations e
      JOIN (
        SELECT vendor_id, MAX(id) AS max_id 
        FROM evaluations 
        GROUP BY vendor_id
      ) latest ON e.id = latest.max_id
      JOIN vendors v ON e.vendor_id = v.id
      WHERE v.status = 'Active'
      ORDER BY 
        e.overall_score DESC, 
        e.quality_score DESC, 
        e.delivery_score DESC, 
        e.price_score DESC
    `);

    // Clear existing recommendations
    await pool.query('DELETE FROM recommendations');

    if (isMongoConnected()) {
      try {
        await Recommendation.deleteMany({});
      } catch (mErr) {
        console.warn('[Mongo Sync Warning]:', mErr.message);
      }
    }

    if (evalRows.length === 0) {
      return;
    }

    let currentRank = 1;
    for (const row of evalRows) {
      const recId = `REC-${1000 + currentRank}`;
      const summaryText = currentRank === 1
        ? `Top Recommended Supplier with highest composite score (${row.overall_score}/100)`
        : `Ranked #${currentRank} supplier alternative (${row.overall_score}/100)`;

      // Insert into SQL recommendations table
      await pool.query(`
        INSERT INTO recommendations 
          (recommendation_id, vendor_id, vendor_code, vendor_name, overall_score, price_score, quality_score, delivery_score, rank, product_categories, city, state, summary, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        recId,
        row.vendor_id,
        row.vendor_code,
        row.vendor_name,
        row.overall_score,
        row.price_score,
        row.quality_score,
        row.delivery_score,
        currentRank,
        row.product_categories || 'Computer Accessories',
        row.city || '',
        row.state || '',
        summaryText,
        'Active'
      ]);

      // Sync with MongoDB Atlas if connected
      if (isMongoConnected()) {
        try {
          await Recommendation.create({
            recommendation_id: recId,
            vendor_id: String(row.vendor_id),
            vendor_code: row.vendor_code,
            vendor_name: row.vendor_name,
            overall_score: row.overall_score,
            price_score: row.price_score,
            quality_score: row.quality_score,
            delivery_score: row.delivery_score,
            rank: currentRank,
            product_categories: row.product_categories || 'Computer Accessories',
            city: row.city || '',
            state: row.state || '',
            summary: summaryText,
            status: 'Active'
          });
        } catch (mErr) {
          console.warn('[Mongo Recommendation Create Warning]:', mErr.message);
        }
      }

      currentRank++;
    }
  } catch (err) {
    console.error('[Sync Recommendations Error]:', err);
  }
}

/**
 * Evaluate Vendor (SCRUM-26 - Admin or User/Requester)
 */
async function evaluateVendor(req, res) {
  let connection;
  try {
    const {
      vendorId,
      quotationId,
      priceScore,
      qualityScore,
      deliveryScore,
      feedback
    } = req.body;

    const evaluatorId = req.user.id || '1';
    const evaluatorName = req.user.name || 'Administrator';

    // 1. Validation - vendorId is required
    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message: 'Vendor ID is required for evaluation.'
      });
    }

    // 2. Validate scores (must be numbers between 0 and 100)
    if (priceScore === undefined || priceScore === null || priceScore === '') {
      return res.status(400).json({
        success: false,
        message: 'Price Score is required.'
      });
    }

    if (qualityScore === undefined || qualityScore === null || qualityScore === '') {
      return res.status(400).json({
        success: false,
        message: 'Quality Score is required.'
      });
    }

    if (deliveryScore === undefined || deliveryScore === null || deliveryScore === '') {
      return res.status(400).json({
        success: false,
        message: 'Delivery Score is required.'
      });
    }

    const p = parseFloat(priceScore);
    const q = parseFloat(qualityScore);
    const d = parseFloat(deliveryScore);

    if (isNaN(p) || p < 0 || p > 100) {
      return res.status(400).json({
        success: false,
        message: 'Price Score must be a valid number between 0 and 100.'
      });
    }

    if (isNaN(q) || q < 0 || q > 100) {
      return res.status(400).json({
        success: false,
        message: 'Quality Score must be a valid number between 0 and 100.'
      });
    }

    if (isNaN(d) || d < 0 || d > 100) {
      return res.status(400).json({
        success: false,
        message: 'Delivery Score must be a valid number between 0 and 100.'
      });
    }

    // 3. Verify vendor exists in database
    const [vendorRows] = await pool.query(
      'SELECT id, vendor_id, vendor_name, email, product_categories, city, state, status FROM vendors WHERE id = ? OR vendor_id = ? LIMIT 1',
      [vendorId, vendorId]
    );

    if (vendorRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found.'
      });
    }

    const vendor = vendorRows[0];
    const overallScore = calculateOverallScore(p, q, d);

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 4. Generate unique Evaluation ID
    const evaluationId = await generateEvaluationId(connection);

    // 5. Insert evaluation into SQL database
    const [result] = await connection.query(`
      INSERT INTO evaluations 
        (evaluation_id, vendor_id, vendor_code, vendor_name, quotation_id, evaluator_id, evaluator_name, price_score, quality_score, delivery_score, overall_score, feedback, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      evaluationId,
      vendor.id,
      vendor.vendor_id,
      vendor.vendor_name,
      quotationId ? String(quotationId).trim() : null,
      String(evaluatorId),
      evaluatorName,
      p,
      q,
      d,
      overallScore,
      feedback ? feedback.trim() : null,
      'Completed'
    ]);

    await connection.commit();
    connection.release();

    // 6. Sync with MongoDB Atlas if connected
    if (isMongoConnected()) {
      try {
        await Evaluation.create({
          evaluation_id: evaluationId,
          vendor_id: String(vendor.id),
          vendor_code: vendor.vendor_id,
          vendor_name: vendor.vendor_name,
          quotation_id: quotationId ? String(quotationId).trim() : null,
          evaluator_id: String(evaluatorId),
          evaluator_name: evaluatorName,
          price_score: p,
          quality_score: q,
          delivery_score: d,
          overall_score: overallScore,
          feedback: feedback ? feedback.trim() : null,
          status: 'Completed'
        });
      } catch (mErr) {
        console.warn('[MongoDB Evaluation Save Warning]:', mErr.message);
      }
    }

    // 7. Dynamically recompute vendor recommendations
    await syncRecommendations();

    return res.status(201).json({
      success: true,
      message: 'Vendor evaluated successfully.',
      evaluationId,
      evaluation: {
        id: result.insertId,
        evaluationId,
        vendorId: vendor.id,
        vendorCode: vendor.vendor_id,
        vendorName: vendor.vendor_name,
        quotationId: quotationId || null,
        evaluatorName,
        priceScore: p,
        qualityScore: q,
        deliveryScore: d,
        overallScore,
        formula: 'Overall = (Price × 40%) + (Quality × 35%) + (Delivery × 25%)',
        feedback: feedback ? feedback.trim() : null
      }
    });

  } catch (err) {
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    console.error('[Evaluate Vendor Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while evaluating vendor.'
    });
  }
}

/**
 * Update an existing Evaluation (SCRUM-26)
 */
async function updateEvaluation(req, res) {
  try {
    const { id } = req.params;
    const {
      priceScore,
      qualityScore,
      deliveryScore,
      feedback
    } = req.body;

    // Check existing evaluation
    const [existingRows] = await pool.query(
      'SELECT * FROM evaluations WHERE id = ? OR evaluation_id = ? LIMIT 1',
      [id, id]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Evaluation not found.'
      });
    }

    const currentEval = existingRows[0];

    const p = priceScore !== undefined ? parseFloat(priceScore) : currentEval.price_score;
    const q = qualityScore !== undefined ? parseFloat(qualityScore) : currentEval.quality_score;
    const d = deliveryScore !== undefined ? parseFloat(deliveryScore) : currentEval.delivery_score;

    if (isNaN(p) || p < 0 || p > 100) {
      return res.status(400).json({
        success: false,
        message: 'Price Score must be a valid number between 0 and 100.'
      });
    }

    if (isNaN(q) || q < 0 || q > 100) {
      return res.status(400).json({
        success: false,
        message: 'Quality Score must be a valid number between 0 and 100.'
      });
    }

    if (isNaN(d) || d < 0 || d > 100) {
      return res.status(400).json({
        success: false,
        message: 'Delivery Score must be a valid number between 0 and 100.'
      });
    }

    const overallScore = calculateOverallScore(p, q, d);
    const updatedFeedback = feedback !== undefined ? (feedback ? feedback.trim() : null) : currentEval.feedback;

    // Update in SQL database
    await pool.query(`
      UPDATE evaluations 
      SET price_score = ?, quality_score = ?, delivery_score = ?, overall_score = ?, feedback = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [p, q, d, overallScore, updatedFeedback, currentEval.id]);

    // Update in MongoDB if connected
    if (isMongoConnected()) {
      try {
        await Evaluation.findOneAndUpdate(
          { evaluation_id: currentEval.evaluation_id },
          {
            price_score: p,
            quality_score: q,
            delivery_score: d,
            overall_score: overallScore,
            feedback: updatedFeedback,
            updatedAt: new Date()
          }
        );
      } catch (mErr) {
        console.warn('[MongoDB Evaluation Update Warning]:', mErr.message);
      }
    }

    // Recompute recommendations dynamically
    await syncRecommendations();

    return res.status(200).json({
      success: true,
      message: 'Evaluation updated successfully.',
      evaluation: {
        id: currentEval.id,
        evaluationId: currentEval.evaluation_id,
        vendorId: currentEval.vendor_id,
        vendorCode: currentEval.vendor_code,
        vendorName: currentEval.vendor_name,
        priceScore: p,
        qualityScore: q,
        deliveryScore: d,
        overallScore,
        feedback: updatedFeedback
      }
    });

  } catch (err) {
    console.error('[Update Evaluation Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while updating evaluation.'
    });
  }
}

/**
 * Get All Evaluations (Admin & User)
 */
async function getAllEvaluations(req, res) {
  try {
    let evaluations = [];

    // Query from MongoDB if connected, otherwise SQL
    if (isMongoConnected()) {
      try {
        evaluations = await Evaluation.find().sort({ createdAt: -1 });
      } catch (mErr) {
        // Fall back to SQL
      }
    }

    if (evaluations.length === 0) {
      const [rows] = await pool.query(`
        SELECT 
          e.id,
          e.evaluation_id,
          e.vendor_id,
          e.vendor_code,
          e.vendor_name,
          e.quotation_id,
          e.evaluator_id,
          e.evaluator_name,
          e.price_score,
          e.quality_score,
          e.delivery_score,
          e.overall_score,
          e.feedback,
          e.status,
          e.created_at,
          v.city,
          v.state,
          v.product_categories
        FROM evaluations e
        LEFT JOIN vendors v ON e.vendor_id = v.id
        ORDER BY e.id DESC
      `);
      evaluations = rows;
    }

    return res.status(200).json({
      success: true,
      count: evaluations.length,
      evaluations
    });
  } catch (err) {
    console.error('[Get All Evaluations Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve evaluations.'
    });
  }
}

/**
 * Get Evaluation By ID
 */
async function getEvaluationById(req, res) {
  try {
    const { id } = req.params;
    let evaluation = null;

    if (isMongoConnected()) {
      try {
        evaluation = await Evaluation.findOne({
          $or: [{ _id: id }, { evaluation_id: id }]
        });
      } catch (e) {
        // Ignored
      }
    }

    if (!evaluation) {
      const [rows] = await pool.query(`
        SELECT 
          e.id,
          e.evaluation_id,
          e.vendor_id,
          e.vendor_code,
          e.vendor_name,
          e.quotation_id,
          e.evaluator_id,
          e.evaluator_name,
          e.price_score,
          e.quality_score,
          e.delivery_score,
          e.overall_score,
          e.feedback,
          e.status,
          e.created_at,
          v.city,
          v.state,
          v.product_categories
        FROM evaluations e
        LEFT JOIN vendors v ON e.vendor_id = v.id
        WHERE e.id = ? OR e.evaluation_id = ?
        LIMIT 1
      `, [id, id]);

      if (rows.length > 0) {
        evaluation = rows[0];
      }
    }

    if (!evaluation) {
      return res.status(404).json({
        success: false,
        message: 'Evaluation not found.'
      });
    }

    return res.status(200).json({
      success: true,
      evaluation
    });
  } catch (err) {
    console.error('[Get Evaluation By ID Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve evaluation.'
    });
  }
}

/**
 * Compare Vendors (SCRUM-27)
 * Side-by-side comparison using real database quotation and evaluation metrics
 */
async function compareVendors(req, res) {
  try {
    // 1. Fetch all active vendors
    const [vendors] = await pool.query(`
      SELECT 
        id,
        vendor_id,
        vendor_name,
        contact_person,
        email,
        phone,
        city,
        state,
        product_categories,
        status
      FROM vendors
      WHERE status = 'Active'
      ORDER BY id ASC
    `);

    // 2. Fetch latest quotations for each vendor
    const [quotations] = await pool.query(`
      SELECT 
        q.id,
        q.quotation_id,
        q.vendor_id,
        q.product_name,
        q.unit_price,
        q.total_price,
        q.delivery_time,
        q.valid_until,
        q.warranty,
        q.status
      FROM quotations q
      JOIN (
        SELECT vendor_id, MAX(id) AS max_id
        FROM quotations
        GROUP BY vendor_id
      ) latest ON q.id = latest.max_id
    `);

    // Map quotations by vendor_id
    const quoMap = {};
    for (const q of quotations) {
      quoMap[q.vendor_id] = q;
    }

    // 3. Fetch latest evaluations for each vendor
    const [evaluations] = await pool.query(`
      SELECT 
        e.id AS evaluation_pk,
        e.evaluation_id,
        e.vendor_id,
        e.price_score,
        e.quality_score,
        e.delivery_score,
        e.overall_score,
        e.feedback,
        e.created_at AS evaluated_at
      FROM evaluations e
      JOIN (
        SELECT vendor_id, MAX(id) AS max_id
        FROM evaluations
        GROUP BY vendor_id
      ) latest ON e.id = latest.max_id
    `);

    const evalMap = {};
    for (const e of evaluations) {
      evalMap[e.vendor_id] = e;
    }

    // 4. Merge data and compute ranking
    const comparisonList = vendors.map(v => {
      const ev = evalMap[v.id];
      const qu = quoMap[v.id];

      const hasEvaluation = Boolean(ev);
      const overallScore = hasEvaluation ? parseFloat(ev.overall_score) : 0;
      const priceScore = hasEvaluation ? parseFloat(ev.price_score) : null;
      const qualityScore = hasEvaluation ? parseFloat(ev.quality_score) : null;
      const deliveryScore = hasEvaluation ? parseFloat(ev.delivery_score) : null;
      const rating = hasEvaluation ? (overallScore / 20).toFixed(1) : null;

      return {
        id: v.id,
        vendor_id: v.vendor_id,
        vendor_name: v.vendor_name,
        contact_person: v.contact_person,
        email: v.email,
        phone: v.phone,
        city: v.city,
        state: v.state,
        product_categories: v.product_categories,
        quotation: qu ? {
          quotation_id: qu.quotation_id,
          product_name: qu.product_name,
          unit_price: qu.unit_price,
          total_price: qu.total_price,
          delivery_time: qu.delivery_time,
          warranty: qu.warranty
        } : null,
        evaluation: hasEvaluation ? {
          evaluation_id: ev.evaluation_id,
          price_score: priceScore,
          quality_score: qualityScore,
          delivery_score: deliveryScore,
          overall_score: overallScore,
          rating,
          feedback: ev.feedback,
          evaluated_at: ev.evaluated_at
        } : null,
        isEvaluated: hasEvaluation,
        overallScore
      };
    });

    // 5. Rank: evaluated vendors sorted by overall score DESC, tie-breaking by quality, delivery, price
    comparisonList.sort((a, b) => {
      if (a.isEvaluated && !b.isEvaluated) return -1;
      if (!a.isEvaluated && b.isEvaluated) return 1;
      if (!a.isEvaluated && !b.isEvaluated) return a.id - b.id;

      if (b.overallScore !== a.overallScore) {
        return b.overallScore - a.overallScore;
      }
      if (b.evaluation.quality_score !== a.evaluation.quality_score) {
        return b.evaluation.quality_score - a.evaluation.quality_score;
      }
      if (b.evaluation.delivery_score !== a.evaluation.delivery_score) {
        return b.evaluation.delivery_score - a.evaluation.delivery_score;
      }
      return b.evaluation.price_score - a.evaluation.price_score;
    });

    // Assign ranking numbers
    let evalRank = 1;
    for (const item of comparisonList) {
      if (item.isEvaluated) {
        item.rank = evalRank++;
        item.isBest = (item.rank === 1);
      } else {
        item.rank = null;
        item.isBest = false;
      }
    }

    const bestVendor = comparisonList.find(v => v.isBest) || null;

    return res.status(200).json({
      success: true,
      totalVendors: comparisonList.length,
      evaluatedCount: evalRank - 1,
      bestVendor,
      scoringFormula: {
        weights: SCORING_WEIGHTS,
        explanation: 'Overall Score = (Price Score × 40%) + (Quality Score × 35%) + (Delivery Score × 25%)'
      },
      vendors: comparisonList
    });

  } catch (err) {
    console.error('[Compare Vendors Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate vendor comparison.'
    });
  }
}

/**
 * Recommend Vendor (SCRUM-28 & Critical Homepage Requirement)
 * Publicly accessible endpoint returning dynamic Best Evaluated Vendor and alternatives.
 */
async function getRecommendedVendor(req, res) {
  try {
    // 1. Fetch top evaluated vendors from MongoDB or SQL
    const [evalRows] = await pool.query(`
      SELECT 
        e.id AS eval_id,
        e.evaluation_id,
        e.vendor_id,
        e.vendor_code,
        e.vendor_name,
        e.price_score,
        e.quality_score,
        e.delivery_score,
        e.overall_score,
        e.feedback,
        v.contact_person,
        v.city,
        v.state,
        v.product_categories,
        v.description,
        v.status AS vendor_status
      FROM evaluations e
      JOIN (
        SELECT vendor_id, MAX(id) AS max_id 
        FROM evaluations 
        GROUP BY vendor_id
      ) latest ON e.id = latest.max_id
      JOIN vendors v ON e.vendor_id = v.id
      WHERE v.status = 'Active'
      ORDER BY 
        e.overall_score DESC, 
        e.quality_score DESC, 
        e.delivery_score DESC, 
        e.price_score DESC
    `);

    // 2. If no vendors have been evaluated yet
    if (evalRows.length === 0) {
      return res.status(200).json({
        success: true,
        recommendedVendor: null,
        alternatives: [],
        count: 0,
        message: 'No evaluated vendors available yet.'
      });
    }

    // 3. Fetch latest quotations for evaluated vendors
    const vendorIds = evalRows.map(r => r.vendor_id);
    const [quoteRows] = await pool.query(`
      SELECT 
        q.id,
        q.quotation_id,
        q.vendor_id,
        q.product_name,
        q.unit_price,
        q.total_price,
        q.delivery_time,
        q.warranty
      FROM quotations q
      JOIN (
        SELECT vendor_id, MAX(id) AS max_id 
        FROM quotations 
        GROUP BY vendor_id
      ) latest ON q.id = latest.max_id
      WHERE q.vendor_id IN (?)
    `, [vendorIds]);

    const quoteMap = {};
    for (const q of quoteRows) {
      quoteMap[q.vendor_id] = q;
    }

    // 4. Format ranked vendors (safe payload, no sensitive info)
    const rankedVendors = evalRows.map((row, index) => {
      const q = quoteMap[row.vendor_id];
      const rating = (row.overall_score / 20).toFixed(1);

      return {
        rank: index + 1,
        vendor_id: row.vendor_code,
        vendor_numeric_id: row.vendor_id,
        vendor_name: row.vendor_name,
        contact_person: row.contact_person,
        city: row.city || 'Tamil Nadu',
        state: row.state || '',
        product_categories: row.product_categories || 'Computer Accessories',
        description: row.description || 'Certified Enterprise Hardware Partner',
        overall_score: row.overall_score,
        price_score: row.price_score,
        quality_score: row.quality_score,
        delivery_score: row.delivery_score,
        rating,
        feedback: row.feedback,
        quotation: q ? {
          quotation_id: q.quotation_id,
          product_name: q.product_name,
          unit_price: q.unit_price,
          delivery_time: q.delivery_time,
          warranty: q.warranty
        } : null,
        badge: index === 0 ? 'Best Evaluated Vendor' : `Rank #${index + 1} Alternative`,
        recommendation_reason: index === 0
          ? `Top composite score of ${row.overall_score}/100 with optimal balance of price (${row.price_score}), quality (${row.quality_score}), and delivery (${row.delivery_score}).`
          : `Strong contender with overall score of ${row.overall_score}/100.`
      };
    });

    const recommendedVendor = rankedVendors[0];
    const alternatives = rankedVendors.slice(1);

    return res.status(200).json({
      success: true,
      recommendedVendor,
      alternatives,
      count: rankedVendors.length,
      scoringFormula: {
        priceWeight: '40%',
        qualityWeight: '35%',
        deliveryWeight: '25%',
        formula: 'Overall Score = (Price × 0.40) + (Quality × 0.35) + (Delivery × 0.25)'
      }
    });

  } catch (err) {
    console.error('[Get Recommended Vendor Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve vendor recommendation.'
    });
  }
}

module.exports = {
  SCORING_WEIGHTS,
  calculateOverallScore,
  evaluateVendor,
  updateEvaluation,
  getAllEvaluations,
  getEvaluationById,
  compareVendors,
  getRecommendedVendor,
  syncRecommendations
};
