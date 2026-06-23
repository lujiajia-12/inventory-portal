/**
 * 问题聚类引擎 - 基于关键词 Jaccard + n-gram 相似度
 *
 * 采用单次聚类策略（single-pass clustering）：
 * 1. 对每个新问题提取关键词（含领域词加权）
 * 2. 与已有簇的质心计算相似度
 * 3. 相似度 > threshold → 归入该簇并更新质心
 * 4. 否则创建新簇
 */

let CONFIG = {};
let clusters = {}; // { clusterId: { canonical, keywords, counts, ... } }

function init(config, existingClusters = {}) {
  CONFIG = {
    similarity_threshold: config.similarity_threshold || 0.7,
    keyword_boost: config.keyword_boost || {},
    min_cluster_size_for_report: config.min_cluster_size_for_report || 2,
    synonyms: config.synonyms || {},
  };
  // 构建同义词反向映射
  CONFIG.synonymMap = {};
  for (const [canonical, aliases] of Object.entries(CONFIG.synonyms)) {
    for (const alias of aliases) {
      CONFIG.synonymMap[alias] = canonical;
    }
    CONFIG.synonymMap[canonical] = canonical;
  }
  clusters = existingClusters;
}

/**
 * 对新问题进行聚类
 * @param {Array} questions - 问题数组 [{question_id, question_text, question_type, keywords, ...}]
 * @returns {object} 更新后的 clusters 对象
 */
function clusterQuestions(questions) {
  if (!questions || questions.length === 0) return clusters;

  let newClusters = 0;
  let assignedCount = 0;

  for (const q of questions) {
    const keywords = q.keywords || [];
    const type = q.question_type || 'general';

    if (keywords.length === 0) {
      // 无关键词的问题直接归入 "other" 簇
      assignToCluster(q, 'cluster_other', '其他问题');
      continue;
    }

    // 计算与所有已有簇的相似度
    const qText = q.question_text || '';
    let bestClusterId = null;
    let bestScore = 0;

    for (const [cId, cData] of Object.entries(clusters)) {
      const score = computeSimilarity(keywords, type, qText, cData);
      if (score > bestScore) {
        bestScore = score;
        bestClusterId = cId;
      }
    }

    if (bestScore >= CONFIG.similarity_threshold && bestClusterId) {
      assignToCluster(q, bestClusterId);
      assignedCount++;
    } else {
      // 创建新簇
      const newId = `cluster_${Date.now()}_${newClusters}`;
      createCluster(newId, q);
      assignToCluster(q, newId);
      newClusters++;
    }
  }

  // 更新 cluster 质心
  recalculateCentroids();

  return clusters;
}

/**
 * 计算问题关键词与簇质心的相似度
 *
 * 针对中文短文本优化：
 * - 单字符 Jaccard（中文每个字都有独立语义）
 * - 双字符 n-gram Jaccard（捕获短语）
 * - 关键词 Jaccard + 覆盖率
 * - 问题类型匹配
 */
function computeSimilarity(keywords, questionType, questionText, clusterData) {
  const cKeywords = clusterData.keywords || [];
  const cType = clusterData.question_type || 'general';
  const qText = questionText || '';

  // 1. Keyword Jaccard（含同义词匹配，但仅对交集做扩展，避免 union 膨胀）
  const kwSet = new Set(keywords);
  const cKwSet = new Set(cKeywords);

  // 计算含同义词的交集：只要 kw 和 cKw 互为同义词即算命中
  let synIntersection = 0;
  const synMatched = new Set();
  for (const kw of kwSet) {
    if (cKwSet.has(kw)) { synIntersection++; synMatched.add(kw); continue; }
    // kw 的同义词是否在 cKw 中
    const canonical = CONFIG.synonymMap?.[kw];
    if (canonical && cKwSet.has(canonical)) { synIntersection++; synMatched.add(kw); continue; }
    const aliases = CONFIG.synonyms?.[kw];
    if (aliases) {
      for (const a of aliases) {
        if (cKwSet.has(a)) { synIntersection++; synMatched.add(kw); break; }
      }
    }
  }
  // 也检查 cKw 的同义词是否在 kwSet 中（去重）
  for (const ck of cKwSet) {
    if (synMatched.has(ck)) continue;
    if (kwSet.has(ck)) { synIntersection++; continue; }
    const canonical = CONFIG.synonymMap?.[ck];
    if (canonical && kwSet.has(canonical)) { synIntersection++; continue; }
    const aliases = CONFIG.synonyms?.[ck];
    if (aliases) {
      for (const a of aliases) {
        if (kwSet.has(a)) { synIntersection++; break; }
      }
    }
  }

  const kwUnion = new Set([...kwSet, ...cKwSet]);
  const keywordJaccard = kwUnion.size === 0 ? 0 : synIntersection / kwUnion.size;

  // 2. Overlap ratio
  const overlapRatio = Math.min(kwSet.size, cKwSet.size) === 0
    ? 0
    : synIntersection / Math.min(kwSet.size, cKwSet.size);

  // 3. Full-text similarity against cluster's canonical + samples
  // LCS ratio (最长公共子串比例) — 对中文特别有效
  // + bigram Jaccard as supplement
  const textsToCompare = [
    clusterData.canonical_question,
    ...(clusterData.sample_questions || []),
  ].filter(Boolean);

  let bestLcsRatio = 0;
  let bestBigramJac = 0;

  // strip helper for length normalization
  const strip = (s) => (s || '').replace(/[？?！!。，,、\s]+/g, '');

  for (const cText of textsToCompare) {
    // LCS ratio: len(LCS) / min(len(stripped_q), len(stripped_c))
    const lcsLen = longestCommonSubstring(qText, cText).length;
    const sqLen = strip(qText).length;
    const scLen = strip(cText).length;
    const minLen = Math.min(sqLen, scLen);
    const lcsRatio = minLen === 0 ? 0 : lcsLen / minLen;

    const qBi = charNgrams(qText, 2);
    const cBi = charNgrams(cText, 2);
    const biInter = [...qBi].filter(n => cBi.has(n));
    const biUnion = new Set([...qBi, ...cBi]);
    const biJac = biUnion.size === 0 ? 0 : biInter.length / biUnion.size;

    if (lcsRatio > bestLcsRatio) bestLcsRatio = lcsRatio;
    if (biJac > bestBigramJac) bestBigramJac = biJac;
  }

  // 4. Type match
  const typeMatch = questionType === cType ? 1.0
    : (isCompatibleType(questionType, cType) ? 0.3 : 0.0);

  // LCS ratio is the strongest signal for Chinese short texts
  // type_match weight kept lower — same question type ≠ same topic
  return 0.35 * bestLcsRatio + 0.20 * bestBigramJac + 0.15 * keywordJaccard + 0.10 * overlapRatio + 0.20 * typeMatch;
}

function charNgrams(text, n) {
  const ngrams = new Set();
  for (let i = 0; i <= text.length - n; i++) {
    ngrams.add(text.substring(i, i + n));
  }
  return ngrams;
}

/** 最长公共子串（动态规划），自动去除标点符号 */
function longestCommonSubstring(a, b) {
  // 去除常见标点，避免"？"等标点贡献无意义匹配
  const strip = (s) => (s || '').replace(/[？?！!。，,、\s]+/g, '');
  const sa = strip(a);
  const sb = strip(b);
  if (!sa || !sb) return '';

  const m = sa.length, n = sb.length;
  let maxLen = 0, endPos = 0;
  const dp = [new Array(n + 1).fill(0), new Array(n + 1).fill(0)];
  for (let i = 1; i <= m; i++) {
    const cur = dp[i % 2];
    const prev = dp[(i - 1) % 2];
    for (let j = 1; j <= n; j++) {
      if (sa[i - 1] === sb[j - 1]) {
        cur[j] = prev[j - 1] + 1;
        if (cur[j] > maxLen) {
          maxLen = cur[j];
          endPos = i;
        }
      } else {
        cur[j] = 0;
      }
    }
  }
  return sa.substring(endPos - maxLen, endPos);
}

function isCompatibleType(t1, t2) {
  const groups = [
    ['how_to', 'what_is', 'general'],
    ['yes_no', 'general'],
    ['why', 'general'],
    ['where', 'when', 'general'],
    ['who', 'general'],
    ['how_much', 'general'],
  ];
  if (t1 === t2) return true;
  return groups.some(g => g.includes(t1) && g.includes(t2));
}

function assignToCluster(question, clusterId, canonicalOverride = null) {
  question.cluster_id = clusterId;

  if (!clusters[clusterId]) {
    createCluster(clusterId, question, canonicalOverride);
  } else {
    const c = clusters[clusterId];
    c.question_ids = c.question_ids || [];
    c.question_ids.push(question.question_id);
    c.total_count = (c.total_count || 0) + 1;

    // 追踪每日计数
    const day = toDateKey(question.timestamp);
    c.daily_counts = c.daily_counts || {};
    c.daily_counts[day] = (c.daily_counts[day] || 0) + 1;

    // 更新时间
    const ts = question.timestamp || Date.now();
    if (!c.first_seen || ts < c.first_seen) c.first_seen = ts;
    if (!c.last_seen || ts > c.last_seen) c.last_seen = ts;

    // 合并关键词
    if (question.keywords) {
      const merged = new Set([...(c.keywords || []), ...question.keywords]);
      c.keywords = [...merged].slice(0, 30);
    }

    // 追加样本问题（用于 n-gram 比对）
    if (question.question_text) {
      c.sample_questions = c.sample_questions || [];
      if (!c.sample_questions.includes(question.question_text)) {
        c.sample_questions.push(question.question_text);
        if (c.sample_questions.length > 5) c.sample_questions.shift();
      }
    }
  }
}

function createCluster(clusterId, question, canonicalOverride = null) {
  const day = toDateKey(question.timestamp);
  clusters[clusterId] = {
    cluster_id: clusterId,
    canonical_question: canonicalOverride || question.question_text || '',
    question_type: question.question_type || 'general',
    keywords: question.keywords || [],
    question_ids: [question.question_id],
    total_count: 1,
    daily_counts: { [day]: 1 },
    first_seen: question.timestamp || Date.now(),
    last_seen: question.timestamp || Date.now(),
    sample_questions: [question.question_text].filter(Boolean).slice(0, 3),
  };
}

/**
 * 重新计算簇质心（选择最近最多出现的问题作为 canonical）
 */
function recalculateCentroids() {
  for (const [cId, cData] of Object.entries(clusters)) {
    // canonical 保持不变（保持稳定性），但更新关键词权重
    if (cData.sample_questions && cData.sample_questions.length < 5) {
      // 保持最多 5 个样本问题
      cData.sample_questions = cData.sample_questions.slice(0, 5);
    }
  }
}

function toDateKey(timestamp) {
  if (!timestamp) timestamp = Date.now();
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 获取按频次排序的簇列表
 */
function getTopClusters(n = 10, dateKey = null) {
  const list = Object.entries(clusters).map(([id, data]) => {
    const count = dateKey
      ? (data.daily_counts?.[dateKey] || 0)
      : (data.total_count || 0);
    return { cluster_id: id, ...data, _count: count };
  });

  list.sort((a, b) => b._count - a._count);
  return list.slice(0, n);
}

/**
 * 周期性重新聚类（合并漂移的小簇）
 */
function reclusterAll(questions) {
  if (!questions || questions.length === 0) return clusters;

  // 保存当前 canonical 信息
  const oldClusters = { ...clusters };
  // 重置 clusters
  clusters = {};

  // 按时间排序
  const sorted = [...questions].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  // 重新聚类
  const result = clusterQuestions(sorted);

  // 恢复被合并的大簇 canonical
  for (const [oldId, oldData] of Object.entries(oldClusters)) {
    if (oldData.total_count >= 3 && !clusters[oldId]) {
      // 大簇被合并了，查找新位置
      for (const [newId, newData] of Object.entries(clusters)) {
        if (newData.question_ids?.some(qid => oldData.question_ids?.includes(qid))) {
          // 恢复 canonical
          newData.canonical_question = oldData.canonical_question || newData.canonical_question;
          break;
        }
      }
    }
  }

  return result;
}

function getClusters() {
  return clusters;
}

module.exports = {
  init,
  clusterQuestions,
  computeSimilarity,
  getTopClusters,
  getClusters,
  reclusterAll,
};
