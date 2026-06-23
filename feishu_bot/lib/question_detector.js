/**
 * 问题检测引擎 - 多层打分机制识别群聊中的提问
 *
 * 评分规则：
 *   +30 以 ？/? 结尾
 *   +25 包含中文疑问词（怎么/如何/为什么/什么/哪/谁/吗/呢/吧...）
 *   +15 包含英文疑问词（how/why/what/where/when/who...）
 *   +10 包含上下文模式（帮我看下/查一下/确认...）
 * 总分 >= min_score(默认30) 判定为问题
 */

let CONFIG = {};

function init(config) {
  CONFIG = {
    min_score: config.min_score || 30,
    weights: config.weights || {
      question_mark: 30,
      zh_keyword: 25,
      en_keyword: 15,
      context_pattern: 10,
    },
    keywords_zh: config.question_keywords_zh || [],
    keywords_en: config.question_keywords_en || [],
    context_patterns: config.context_patterns || [],
  };
}

/**
 * 检测一条消息是否为问题
 * @param {string} text - 消息纯文本
 * @returns {{ is_question: boolean, score: number, question_type: string, keywords: string[], matched_patterns: string[] }}
 */
function detect(text) {
  if (!text || typeof text !== 'string') {
    return emptyResult();
  }

  const cleaned = text.trim();
  if (!cleaned) return emptyResult();

  let score = 0;
  const matched = [];

  // Layer 1: 问号检测
  if (/[？?]$/.test(cleaned) || /[？?]/.test(cleaned)) {
    score += CONFIG.weights.question_mark;
    matched.push('问号结尾');
  }

  // Layer 2: 中文疑问词匹配（多个疑问词可累加，最高2次）
  const zhMatches = [];
  for (const kw of CONFIG.keywords_zh) {
    if (cleaned.includes(kw)) {
      zhMatches.push(kw);
      score += CONFIG.weights.zh_keyword;
      if (zhMatches.length >= 2) break; // 最多加2次分
    }
  }
  if (zhMatches.length > 0) {
    matched.push(`疑问词:${zhMatches.join(',')}`);
  }

  // Layer 3: 英文疑问词匹配
  const lowerText = cleaned.toLowerCase();
  const enMatches = [];
  for (const kw of CONFIG.keywords_en) {
    const regex = new RegExp(`\\b${kw}\\b`, 'i');
    if (regex.test(lowerText)) {
      enMatches.push(kw);
      score += CONFIG.weights.en_keyword;
      break;
    }
  }
  if (enMatches.length > 0) {
    matched.push(`EN:${enMatches.join(',')}`);
  }

  // Layer 4: 上下文模式匹配（最多2次累加）
  const ctxMatches = [];
  for (const pattern of CONFIG.context_patterns) {
    if (cleaned.includes(pattern)) {
      ctxMatches.push(pattern);
      score += CONFIG.weights.context_pattern;
      if (ctxMatches.length >= 2) break;
    }
  }
  if (ctxMatches.length > 0) {
    matched.push(`模式:${ctxMatches.join(',')}`);
  }

  const isQuestion = score >= CONFIG.min_score;
  const questionType = isQuestion ? classifyType(cleaned) : 'not_question';
  const keywords = isQuestion ? extractKeywords(cleaned) : [];

  return {
    is_question: isQuestion,
    score,
    question_type: questionType,
    keywords,
    matched_patterns: matched,
  };
}

/**
 * 问题类型分类
 */
function classifyType(text) {
  if (/怎么|如何/.test(text)) return 'how_to';
  if (/为什么|为啥/.test(text)) return 'why';
  if (/哪里|在哪|什么地方/.test(text)) return 'where';
  if (/什么时候|多久|几点/.test(text)) return 'when';
  if (/谁|哪个|哪位/.test(text)) return 'who';
  if (/吗[？?]?$/.test(text) || /是不是|有没有|能不能|可不可以/.test(text)) return 'yes_no';
  if (/什么/.test(text)) return 'what_is';
  if (/多少/.test(text)) return 'how_much';
  return 'general';
}

/**
 * 提取关键词（基于字符 n-gram，去停用词）
 */
function extractKeywords(text) {
  const stopwords = new Set([
    '的', '了', '是', '我', '你', '他', '她', '它', '们',
    '在', '有', '和', '就', '不', '人', '都', '一', '一个',
    '上', '也', '很', '到', '说', '要', '去', '会', '可以',
    '这个', '那个', '还是', '没有', '知道', '已经', '因为',
    '所以', '但是', '如果', '虽然', '而且', '然后',
    '啊', '哦', '嗯', '呢', '哈', '吧', '吗',
    '？', '?', '！', '!', '。', '，', ',',
  ]);

  // 先按标点切分
  const segments = text.split(/[，,。！!？?\s]+/).filter(Boolean);
  const keywords = [];

  for (const seg of segments) {
    // 2-gram
    for (let i = 0; i < seg.length - 1; i++) {
      const bigram = seg.substring(i, i + 2);
      if (!stopwords.has(bigram) && bigram.length === 2) {
        keywords.push(bigram);
      }
    }
    // 3-gram（更精准）
    for (let i = 0; i < seg.length - 2; i++) {
      const trigram = seg.substring(i, i + 3);
      if (!stopwords.has(trigram)) {
        keywords.push(trigram);
      }
    }
    // 完整词段
    if (seg.length >= 2 && !stopwords.has(seg)) {
      keywords.push(seg);
    }
  }

  // 去重并去重疑问词（疑问词区分度低）
  const questionMarkers = new Set([
    '怎么', '如何', '为什么', '什么', '哪里', '在哪', '什么时候',
    '多少', '是不是', '有没有', '能不能', '请问', '可以',
  ]);
  const unique = [...new Set(keywords)].filter(k => !questionMarkers.has(k));

  return unique.slice(0, 20); // 最多 20 个关键词
}

function emptyResult() {
  return {
    is_question: false,
    score: 0,
    question_type: 'not_question',
    keywords: [],
    matched_patterns: [],
  };
}

module.exports = { init, detect, extractKeywords, classifyType };
