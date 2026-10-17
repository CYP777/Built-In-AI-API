export interface ProfanityCheckResult {
  hasProfanity: boolean;
  matches: string[];
  matchedWords: string[];
  severity: 'high' | 'medium' | 'low' | 'none';
}

const PROFANITY_ENABLED_KEY = 'ai_profanity_filter_enabled';

// รายการคำหยาบคาย วลีด่าทอ และคำไม่สุภาพภาษาไทย (Severe & Compound Words)
const THAI_PROFANITY_LIST = [
  // ด่าบุพการี / ครอบครัว
  'พ่อมึงตาย',
  'แม่มึงตาย',
  'พ่อมึง',
  'แม่มึง',
  'ลูกกะหรี่',
  'ลูกโสเภณี',

  // คำด่าสัตว์ / สบถหยาบ
  'ไอ้เหี้ย',
  'อีเหี้ย',
  'ตัวเหี้ย',
  'ไอ้สัส',
  'อีสัส',
  'ไอ้สัตว์',
  'อีสัตว์',
  'ไอ้ควาย',
  'อีควาย',
  'ควายเอ๊ย',
  'หน้าควาย',
  'ไอ้หมา',
  'อีหมา',
  'หน้าหมา',
  'หมาไม่แดก',
  'ไอ้เปรต',
  'อีเปรต',
  'เปรต',

  // คำลามก / อวัยวะเพศ
  'ควย',
  'แตด',
  'จิ๋ม',
  'เงี่ยน',
  'เย็ด',
  'เยด',
  'เย็ดแม่',
  'เย็ดเป็ด',
  'เย็ดเข้',
  'ซ่อง',
  'โสเภณี',
  'กะหรี่',
  'ดอกทอง',
  'อีดอก',
  'ดอกทวย',

  // คำด่าทอ สาปแช่ง และถ้อยคำรุนแรง
  'ชิบหาย',
  'ฉิบหาย',
  'ส้นตีน',
  'กวนส้นตีน',
  'กวนตีน',
  'ชาติชั่ว',
  'ระยำ',
  'จัญไร',
  'เสนียด',
  'สถุล',
  'เสือก',
  'หน้าด้าน',
  'สันดานหมา',
  'สันดานเสีย',
  'สันดาน',
  'ไอ้เวร',
  'อีเวร',
  'เวรเอ๊ย',
  'เวรตะไล',
  'แม่ง',
  'หัวดอ',
  'กากเดน',
];

// รายการคำหยาบคายภาษาอังกฤษ (English Profanity)
const ENGLISH_PROFANITY_LIST = [
  'fuck',
  'fucking',
  'fucker',
  'fucked',
  'motherfucker',
  'shit',
  'bullshit',
  'shitty',
  'bitch',
  'bitches',
  'asshole',
  'bastard',
  'dick',
  'pussy',
  'cunt',
  'whore',
  'slut',
  'dumbass',
  'wtf',
];

/**
 * ตรวจสอบว่าข้อความมีคำหยาบคาย คำด่าทอ หรือถ้อยคำที่ไม่เหมาะสมหรือไม่
 */
export function detectProfanity(text: string): ProfanityCheckResult {
  if (!text || typeof text !== 'string') {
    return { hasProfanity: false, matches: [], matchedWords: [], severity: 'none' };
  }

  const lower = text.toLowerCase();
  const matches: string[] = [];

  // 1. ตรวจสอบการสะกดหลบหลีก (Spaced / Obfuscated เช่น "ค ว ย", "ค.ว.ย", "สั ส", "เ หี้ ย", "f*ck")
  const obfuscatedRegex =
    /(ค[\s._-]*ว[\s._-]*ย|สั[\s._-]*ส|เ[\s._-]*หี้[\s._-]*ย|เ[\s._-]*ย็[\s._-]*ด|มึ[\s._-]*ง|f[\s._*-]*u[\s._*-]*c[\s._*-]*k|s[\s._*-]*h[\s._*-]*i[\s._*-]*t|b[\s._*-]*i[\s._*-]*t[\s._*-]*c[\s._*-]*h)/gi;
  let obMatch: RegExpExecArray | null;
  while ((obMatch = obfuscatedRegex.exec(lower)) !== null) {
    matches.push(obMatch[1]);
  }

  // 2. ตรวจสอบคำหยาบภาษาอังกฤษแบบเซ็นเซอร์ เช่น f*ck, sh*t, b*tch, d*ck
  const enCensoredRegex =
    /\b(f[*u]ck|f[*u]cking|sh[*i]t|b[*i]tch|a[*s]{2}hole|d[*i]ck|p[*u]ssy|c[*u]nt)\b/i;
  const enCensoredMatch = enCensoredRegex.exec(lower);
  if (enCensoredMatch) {
    matches.push(enCensoredMatch[1]);
  }

  // 3. ตรวจสอบรายการคำหยาบคายภาษาไทย
  for (const word of THAI_PROFANITY_LIST) {
    if (lower.includes(word)) {
      matches.push(word);
    }
  }

  // 4. ตรวจคำเดี่ยว 'เหี้ย' (หากยังไม่ถูกจับโดย ไอ้เหี้ย / อีเหี้ย)
  if (/เหี้ย/.test(lower) && !matches.includes('เหี้ย') && !matches.includes('ไอ้เหี้ย') && !matches.includes('อีเหี้ย')) {
    matches.push('เหี้ย');
  }

  // 5. ตรวจคำเดี่ยว 'สัส' (หากยังไม่ถูกจับโดย ไอ้สัส / อีสัส)
  if (/สัส/.test(lower) && !matches.includes('สัส') && !matches.includes('ไอ้สัส') && !matches.includes('อีสัส')) {
    matches.push('สัส');
  }

  // 6. ตรวจคำว่า 'มึง' (รวม มรึง, มืง) - ยกเว้นคำสุภาพ เช่น ทะมึงทึง, ขมึงทึง
  if (/มึง|มรึง|มืง/.test(lower) && !lower.includes('ทะมึงทึง') && !lower.includes('ขมึงทึง')) {
    matches.push('มึง');
  }

  // 7. ตรวจคำว่า 'หี' (ต้องไม่เป็นส่วนหนึ่งของคำสุภาพ เช่น หีบ, หีบเพลง, เหี้ย)
  if (/(?:^|[^\u0E00-\u0E7F]|อี|ไอ้)หี(?![บดลมกทมปพฝฟผภฝค])(?:$|[^\u0E00-\u0E7F]|\s|แตด|เน่า)/.test(lower)) {
    matches.push('หี');
  }

  // 8. ตรวจคำว่า 'กู' เมื่ออยู่โดดๆ หรือตามด้วยคำลงท้ายหยาบคาย (ไม่แมตช์คำเช่น กูเกิล, กูรู, กูณฑ์)
  if (/(?:^|\s|[^\u0E00-\u0E7F])กู(?:\s|$|[^\u0E00-\u0E7F]|มึง|ด่า|วะ|ว่ะ|โว้ย|เว้ย|เหี้ย|สัส)/.test(lower)) {
    matches.push('กู');
  }

  // 9. ตรวจคำหยาบภาษาอังกฤษพร้อมขอบเขตคำ (Word Boundary)
  for (const en of ENGLISH_PROFANITY_LIST) {
    const rx = new RegExp('(?:^|[^a-zA-Z0-9])' + en + '(?:$|[^a-zA-Z0-9])', 'i');
    if (rx.test(lower)) {
      matches.push(en);
    }
  }

  const uniqueMatches = Array.from(new Set(matches));
  const hasProfanity = uniqueMatches.length > 0;

  // กำหนดระดับความรุนแรง
  let severity: ProfanityCheckResult['severity'] = 'none';
  if (hasProfanity) {
    const hasSevereWord = uniqueMatches.some(
      (m) =>
        m.includes('ควย') ||
        m.includes('เหี้ย') ||
        m.includes('เย็ด') ||
        m.includes('สัส') ||
        m.includes('พ่อมึงตาย') ||
        m.includes('แม่มึงตาย') ||
        m.includes('fuck') ||
        m.includes('cunt') ||
        m.includes('shit')
    );
    severity = hasSevereWord ? 'high' : 'medium';
  }

  return {
    hasProfanity,
    matches: uniqueMatches,
    matchedWords: uniqueMatches,
    severity,
  };
}

/**
 * สร้างข้อความตอบปฏิเสธอย่างสุภาพเมื่อตรวจพบคำหยาบคาย ตามนโยบายความปลอดภัยและจริยธรรม (Pillar 2)
 */
export function getProfanitySafetyMessage(matchedWords?: string[]): string {
  const wordsSnippet =
    matchedWords && matchedWords.length > 0
      ? `\n- **ถ้อยคำที่ตรวจพบ:** \`${matchedWords.slice(0, 3).join('`, `')}\``
      : '';

  return (
    `**[นโยบายความปลอดภัย] Content Safety & Ethical Policy**\n\n` +
    `ขออภัยครับ ระบบตรวจพบถ้อยคำที่ไม่สุภาพ คำหยาบคาย หรือคำด่าทอในข้อความของคุณ${wordsSnippet}\n\n` +
    `ตามข้อตกลงและนโยบายความปลอดภัย AI (Safety & Prohibited Content) ระบบแชทบอทนี้ถูกออกแบบมาเพื่อสนับสนุนการแลกเปลี่ยนข้อมูลอย่างสร้างสรรค์ สุภาพ และให้เกียรติซึ่งกันและกัน จึงขอปฏิเสธการประมวลผลคำตอบสำหรับข้อความที่ไม่สุภาพครับ\n\n` +
    `*คำแนะนำ: คุณสามารถพิมพ์คำถามหรือหัวข้อที่ต้องการสนทนาใหม่อีกครั้งด้วยถ้อยคำที่สุภาพและสร้างสรรค์ได้เลยครับ ผมยินดีให้ข้อมูลและช่วยเหลืออย่างเต็มที่ครับ*`
  );
}

/**
 * ตรวจสอบว่าระบบเปิดใช้งานตัวกรองคำหยาบคายหรือไม่ (ค่าเริ่มต้น: เปิดใช้งาน)
 */
export function isProfanityFilterEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const saved = localStorage.getItem(PROFANITY_ENABLED_KEY);
  return saved !== 'false';
}

/**
 * บันทึกสถานะเปิด/ปิด ตัวกรองคำหยาบคาย
 */
export function setProfanityFilterEnabled(enabled: boolean): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(PROFANITY_ENABLED_KEY, enabled ? 'true' : 'false');
  }
}
