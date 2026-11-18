export const MEALS = ['早餐', '午餐', '晚餐', '加餐'];
export const ACTIVITIES = [
  { name: '散步 · 轻松', met: 2.8 },
  { name: '快走 · 约 5.5 km/h', met: 4.3 },
  { name: '慢跑 · 约 8 km/h', met: 8.3 },
  { name: '骑车 · 休闲', met: 4 },
  { name: '游泳 · 轻中强度', met: 6 },
  { name: '力量训练 · 中等强度', met: 3.5 },
  { name: '瑜伽 · 一般', met: 2.5 },
  { name: '跳绳 · 中等强度', met: 11.8 },
];
export const emptyState = () => ({ version: 1, profiles: [], weights: [], meals: [], exercises: [], customFoods: [], completedDays: [] });
export const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function shiftDate(date, amount) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + amount);
  return localDate(d);
}
export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}
export function inRange(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}
export function validateProfile(p) {
  return p && ['male', 'female'].includes(p.sex) && Number.isInteger(p.age) && inRange(p.age, 18, 100) && inRange(p.height, 100, 230) && inRange(p.weight, 30, 300) && [1.2, 1.35, 1.5].includes(p.activity) && ['lose', 'maintain', 'gain'].includes(p.goal);
}
export function profileAt(state, date) {
  const profile = state.profiles.filter(p => p.date <= date).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!profile) return null;
  const weight = state.weights.filter(w => w.date <= date && w.date >= profile.date).sort((a, b) => b.date.localeCompare(a.date))[0];
  return { ...profile, weight: weight?.value ?? profile.weight };
}
export function metabolism(p) {
  const bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === 'male' ? 5 : -161);
  const base = bmr * p.activity;
  const bmi = p.weight / (p.height / 100) ** 2;
  const offset = p.goal === 'lose' && bmi >= 18.5 ? -300 : p.goal === 'gain' ? 200 : 0;
  return { bmr, base, bmi, offset, target: Math.max(bmr, base + offset) };
}
export function nutrition(food, grams) {
  if (!inRange(grams, 0.1, 10000)) throw new Error('食物重量需在 0.1–10000 克之间');
  return Object.fromEntries(['kcal', 'protein', 'carbs', 'fat'].map(key => [key, food[key] === null ? null : food[key] * grams / 100]));
}
export function exerciseCalories(met, weight, minutes) {
  if (!inRange(met, 1, 25) || !inRange(weight, 30, 300) || !inRange(minutes, 1, 600)) throw new Error('请检查运动强度、体重和时长');
  return (met - 1) * 3.5 * weight / 200 * minutes;
}
export function summary(state, date) {
  const meals = state.meals.filter(m => m.date === date);
  const exercises = state.exercises.filter(e => e.date === date);
  const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const missing = { protein: false, carbs: false, fat: false };
  for (const meal of meals) {
    const n = nutrition(meal.food, meal.grams);
    for (const key of Object.keys(totals)) {
      if (n[key] === null) missing[key] = true;
      else totals[key] += n[key];
    }
  }
  const exercise = exercises.reduce((sum, e) => sum + e.kcal, 0);
  const profile = profileAt(state, date);
  const meta = profile ? metabolism(profile) : null;
  const expenditure = meta ? meta.base + exercise : null;
  const target = meta ? meta.target + exercise : null;
  return { meals, exercises, totals, missing, exercise, profile, meta, expenditure, target, remaining: target === null ? null : target - totals.kcal, gap: expenditure === null || !meals.length ? null : totals.kcal - expenditure, complete: state.completedDays.includes(date) };
}
const text = (v, max = 240) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
export function validateFood(f) {
  return f && text(f.id, 100) && text(f.name) && text(f.description, 1000) && text(f.category, 30) && text(f.unit, 40) && inRange(f.portion, 0.1, 10000) && inRange(f.kcal, 0, 1000) && ['protein', 'carbs', 'fat'].every(k => f[k] === null || inRange(f[k], 0, 100));
}
export function validateState(s) {
  const fail = () => { throw new Error('备份格式或数值不正确，未修改现有数据。'); };
  if (!s || s.version !== 1) fail();
  for (const key of ['profiles', 'weights', 'meals', 'exercises', 'customFoods', 'completedDays']) if (!Array.isArray(s[key]) || s[key].length > 50000) fail();
  if (!s.profiles.every(p => validDate(p.date) && validateProfile(p))) fail();
  if (!s.weights.every(w => w && validDate(w.date) && inRange(w.value, 30, 300))) fail();
  if (!s.meals.every(m => m && text(m.id, 100) && validDate(m.date) && MEALS.includes(m.meal) && validateFood(m.food) && inRange(m.grams, 0.1, 10000) && inRange(m.quantity, 0.00001, 10000) && ['grams', 'portion'].includes(m.mode) && inRange(m.portion, 0.1, 10000) && Math.abs(m.grams - m.quantity * (m.mode === 'grams' ? 1 : m.portion)) < 0.000001)) fail();
  if (!s.exercises.every(e => e && text(e.id, 100) && text(e.name) && validDate(e.date) && inRange(e.minutes, 1, 600) && inRange(e.weight, 30, 300) && inRange(e.kcal, 0, 10000) && ['met', 'manual'].includes(e.method) && (e.method !== 'met' || (inRange(e.met, 1, 25) && Math.abs(e.kcal - exerciseCalories(e.met, e.weight, e.minutes)) < 0.00001)))) fail();
  if (!s.customFoods.every(validateFood) || !s.completedDays.every(validDate)) fail();
  for (const [key, field] of [['profiles', 'date'], ['weights', 'date'], ['meals', 'id'], ['exercises', 'id'], ['customFoods', 'id']]) if (new Set(s[key].map(item => item[field])).size !== s[key].length) fail();
  return s;
}
const mealNumber = '(?:\\d+(?:\\.\\d+)?|\\.\\d+|[零一二两三四五六七八九十百半]+)';
const mealUnit = '(?:千克|公斤|kg|毫升|ml|克|g|斤|升|l|个|只|碗|份|杯|瓶|盒|袋|片|根|块|条|枚|串|勺)';
function parseMealNumber(value) {
  if (/^[\d.]+$/.test(value)) return Number(value);
  if (value === '半') return .5;
  const digits = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  let total = 0, current = 0;
  for (const char of value) {
    if (char === '十' || char === '百') { total += (current || 1) * (char === '十' ? 10 : 100); current = 0; }
    else if (char in digits) current = digits[char];
    else return NaN;
  }
  return total + current;
}
export function parseMealText(value, defaultMeal = '早餐') {
  if (typeof value !== 'string' || !value.trim() || value.length > 2000) throw new Error('请输入 1–2000 字的整餐内容');
  let source = value.trim().replace(/[０-９．]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const prefix = source.match(/^(?:今天|今日)?\s*(早餐|午餐|晚餐|加餐)\s*(?:吃了?|喝了?|是)?\s*[:：]?\s*/);
  const meal = prefix?.[1] ?? defaultMeal;
  if (prefix) source = source.slice(prefix[0].length);
  const parts = [];
  let part = '', depth = 0;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if ('（(['.includes(c)) depth++;
    if ('）)]'.includes(c)) depth = Math.max(0, depth - 1);
    if (!depth && (/[+＋,，、;；\n]/.test(c) || (c === '和' && part.trim() && !/[田牛]/.test(source[i + 1] ?? '')))) {
      if (part.trim()) parts.push(part.trim());
      part = '';
    } else part += c;
  }
  if (part.trim()) parts.push(part.trim());
  if (!parts.length || parts.length > 30) throw new Error('每次请填写 1–30 项食物');
  let brand = '';
  const items = parts.map(raw => {
    let name = raw.replace(/^(?:吃了?|喝了?)\s*/, '').replace(/[。！!]+$/, '').trim();
    let quantity = 1, unit = '', explicitQuantity = false;
    const before = name.match(new RegExp(`^(${mealNumber})\\s*(${mealUnit})\\s*`, 'i'));
    const after = name.match(new RegExp(`\\s*[×xX*]?\\s*(${mealNumber})\\s*(${mealUnit})$`, 'i'));
    const count = name.match(new RegExp(`\\s*[×xX*]\\s*(${mealNumber})$`, 'i'));
    const amount = before ?? after ?? count;
    if (amount) {
      quantity = parseMealNumber(amount[1]); unit = (amount[2] ?? '').toLowerCase(); explicitQuantity = true;
      name = (before ? name.slice(amount[0].length) : name.slice(0, amount.index)).trim();
    }
    const ownBrand = name.match(/^(麦当劳|肯德基|汉堡王|必胜客|星巴克|瑞幸)\s*/);
    if (ownBrand) { brand = ownBrand[1]; name = name.slice(ownBrand[0].length).trim(); }
    const sizeMatch = name.match(/^(大份|中份|小份|大杯|中杯|小杯)\s*/)
      ?? name.match(/^(大|中|小)(?=薯条)/)
      ?? name.match(/[（(](大份|中份|小份|大杯|中杯|小杯)[）)]$/);
    let size = '';
    if (sizeMatch) {
      size = sizeMatch[1].length === 1 ? `${sizeMatch[1]}份` : sizeMatch[1];
      name = `${name.slice(0, sizeMatch.index)}${name.slice(sizeMatch.index + sizeMatch[0].length)}`.trim();
    }
    if (!name) throw new Error(`“${raw}”缺少食物名称`);
    const weightFactor = { 克: 1, g: 1, 千克: 1000, 公斤: 1000, kg: 1000, 斤: 500 }[unit];
    const volume = ['ml', '毫升', 'l', '升'].includes(unit);
    return { raw, name, brand, size, quantity: volume ? null : quantity * (weightFactor ?? 1), unit, mode: weightFactor || volume ? 'grams' : 'portion', explicitQuantity, volume };
  });
  return { meal, items };
}
export function mealFoodCandidates(foods, item) {
  return searchFoods(foods, [item.brand, item.name].filter(Boolean).join(' '));
}
export function searchFoods(foods, query, category = '全部') {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return foods.filter(f => (category === '全部' || f.category === category) && terms.every(t => `${f.name} ${f.description}`.toLowerCase().includes(t))).sort((a, b) => Number(b.featured ?? false) - Number(a.featured ?? false));
}
