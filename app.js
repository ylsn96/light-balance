import { MEALS, ACTIVITIES, emptyState, localDate, shiftDate, validDate, inRange, validateProfile, profileAt, metabolism, nutrition, exerciseCalories, summary, validateState, validateFood, searchFoods, parseMealText, mealFoodCandidates } from './core.js';

const $ = (selector, root = document) => root.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const num = (value, digits = 0) => value === null || value === undefined ? '—' : value.toLocaleString('zh-CN', { maximumFractionDigits: digits });
const signed = value => value === null ? '—' : `${value > 0 ? '+' : ''}${num(value)}`;
const uid = () => crypto.randomUUID();
const storageKey = `light-balance:${new URL('.', location.href).pathname}:v1`;
const categories = ['全部', '主食', '蛋奶豆', '肉类海鲜', '蔬菜', '水果', '油脂坚果', '其他'];
let state = emptyState(), foods = [], foodError = '', selectedDate = localDate(), tab = 'dashboard';
let lastSaved = null, storageBlocked = false, toastTimer, selectedFood = null, editingMeal = null;
let foodQuery = '', foodCategory = '全部', foodLimit = 36, period = 7;

function warnStorage(message) {
  const banner = $('#storage-warning');
  banner.hidden = false;
  banner.replaceChildren(document.createTextNode(message + ' '));
  if (lastSaved) {
    const button = document.createElement('button');
    button.className = 'text-button'; button.textContent = '下载原始数据';
    button.onclick = () => download(lastSaved, 'light-balance-backup-recovery.json');
    banner.append(button);
  }
}
try {
  lastSaved = localStorage.getItem(storageKey);
  if (lastSaved) state = validateState(JSON.parse(lastSaved));
} catch {
  storageBlocked = true;
  warnStorage('本地数据无法读取，已停止写入以保护原记录。请导出原始数据，或在身体与目标页面恢复有效备份。');
}
function toast(message) {
  clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3600);
}
let savePending = false;
async function save(next, replace = false) {
  if (storageBlocked && !replace) { toast('请先恢复有效备份；现有数据未覆盖。'); return false; }
  if (savePending) { toast('正在保存，请稍候'); return false; }
  if (!navigator.locks) { toast('安全保存需要新版浏览器，请通过 HTTPS 或 localhost 打开应用'); return false; }
  savePending = true;
  try {
    const expected = replace ? localStorage.getItem(storageKey) : lastSaved;
    validateState(next);
    const serialized = JSON.stringify(next);
    return await navigator.locks.request(storageKey, () => {
      const current = localStorage.getItem(storageKey);
      if (current !== expected) {
        state = current ? validateState(JSON.parse(current)) : emptyState();
        lastSaved = current; storageBlocked = false; $('#storage-warning').hidden = true; render();
        toast('另一个页面已更新数据，请检查后重新保存。'); return false;
      }
      localStorage.setItem(storageKey, serialized);
      lastSaved = serialized; state = next; storageBlocked = false; $('#storage-warning').hidden = true;
      return true;
    });
  } catch (error) {
    warnStorage('本次保存失败，可能是浏览器存储已满或不可用。现有记录未被覆盖，请及时导出备份。');
    toast(error.message || '保存失败'); return false;
  } finally { savePending = false; }
}
function mutate(fn) {
  const next = structuredClone(state); fn(next); return save(next);
}
function allFoods() { return [...state.customFoods, ...foods]; }
function dayCaption(date) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
}
function empty(iconName, title, description = '') {
  return `<div class="empty"><span class="empty-icon">${icon(iconName)}</span><h3>${title}</h3><p>${description}</p></div>`;
}
function heading(eyebrow, title, subtitle, action = '') {
  return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p class="subheading">${subtitle}</p></div>${action}</div>`;
}
function metric(label, value, unit, caption, iconName = 'flame', className = '') {
  return `<div class="metric"><div class="metric-top ${className}">${icon(iconName)}${label}</div><b>${value}<small>${unit}</small></b><p>${caption}</p></div>`;
}
function macroPanel(s) {
  const targets = s.target ? { carbs: s.target * .5 / 4, protein: s.target * .2 / 4, fat: s.target * .3 / 9 } : null;
  return `<section class="panel"><div class="panel-header"><h2>营养，均衡一点</h2><span class="pill">三大营养素</span></div>${[
    ['carbs', '碳水化合物', '#88a57e'], ['protein', '蛋白质', '#d6a46b'], ['fat', '脂肪', '#83a1b9'],
  ].map(([key, name, color]) => `<div class="macro"><div class="macro-head"><span><i class="dot" style="background:${color}"></i>${name}</span><b>${num(s.totals[key], 1)}${s.missing[key] ? '+' : ''} <span class="muted" style="display:inline;font-weight:400">/ ${num(targets?.[key])} g</span></b></div><div class="progress"><span style="width:${targets ? Math.min(100, s.totals[key] / targets[key] * 100) : 0}%;background:${color}"></span></div></div>`).join('')}<div class="macro-note">参考分配：碳水 50% · 蛋白质 20% · 脂肪 30%。${Object.values(s.missing).some(Boolean) ? '“+”表示部分食物缺少营养数据，当前仅为已知合计。' : '这是一般参考比例，可根据专业建议调整饮食。'}</div></section>`;
}
function mealPanel(s) {
  return `<section class="panel"><div class="panel-header"><div><h2>一日三餐，好好吃饭</h2><p class="caption">${s.meals.length ? `已记录 ${s.meals.length} 项食物` : '从第一餐，开始今天的记录'}</p></div><span class="pill">${s.complete ? '当日已记全' : '记录中'}</span></div>${MEALS.map((meal, index) => {
    const rows = s.meals.filter(m => m.meal === meal);
    const total = rows.reduce((sum, m) => sum + nutrition(m.food, m.grams).kcal, 0);
    return `<div class="meal-group"><div class="meal-heading"><span class="meal-icon" style="${index === 2 ? 'background:#eef0f7;color:#939eb6' : index === 3 ? 'background:#f1f5e8;color:#9aa57b' : ''}">${icon(index === 2 ? 'moon' : index === 3 ? 'leaf' : 'sun')}</span><div><h3>${meal}</h3><p>${['开启元气一天', '给下午充点电', '认真对待这一餐', '一点小小的补给'][index]}</p></div><div class="meal-total">${num(total)} <small>kcal</small></div><button class="icon-button" data-action="add-food" data-meal="${meal}" aria-label="添加${meal}">${icon('plus')}</button></div>${rows.length ? rows.map(m => `<div class="food-log"><button class="log-meta log-edit" data-action="edit-meal" data-id="${esc(m.id)}"><div class="log-name">${esc(m.food.name)}</div><div class="log-detail">${m.mode === 'portion' ? `${num(m.quantity, 2)} ${esc(m.food.unit)} · ` : ''}${num(m.grams, 1)} 克 · 点击修改</div></button><span class="log-kcal">${num(nutrition(m.food, m.grams).kcal)}</span><button class="icon-button" data-action="delete-meal" data-id="${esc(m.id)}" aria-label="删除${esc(m.food.name)}">×</button></div>`).join('') : '<p class="meal-empty">还没记录，吃完记得来这里。</p>'}</div>`;
  }).join('')}<label class="complete-row"><input id="complete-day" type="checkbox" ${s.complete ? 'checked' : ''} ${!s.meals.length ? 'disabled' : ''}>当天饮食已全部记完</label></section>`;
}
function exercisePanel(s) {
  return `<section class="panel"><div class="panel-header"><h2>动一动，状态更好</h2><button class="text-button" data-action="add-exercise">+ 记录运动</button></div>${s.exercises.length ? s.exercises.map(e => `<div class="exercise-item"><span class="exercise-icon">${icon('run')}</span><div><h3>${esc(e.name)}</h3><p>${num(e.minutes)} 分钟 · ${e.method === 'manual' ? '手动净消耗' : '估算净消耗'}</p></div><strong>${num(e.kcal)} <small>kcal</small></strong><button class="icon-button" data-action="delete-exercise" data-id="${esc(e.id)}" aria-label="删除${esc(e.name)}">×</button></div>`).join('') : empty('run', '今天，想怎么动一动？', '散步、慢跑或力量训练，都值得记录。')}<p class="small-text muted" style="margin-top:13px">仅记录日常活动之外的额外运动。</p></section>`;
}
function dashboard() {
  const s = summary(state, selectedDate);
  const progress = s.target ? Math.min(1, s.totals.kcal / s.target) : 0;
  return heading('A LITTLE BALANCE, EVERY DAY', selectedDate === localDate() ? '每一餐，都心中有数。' : '把这一天，认真记下来。', `${dayCaption(selectedDate)} · 不追求完美，只在意每天的一点改变`, `<div class="heading-actions"><button class="button secondary" data-action="whole-meal">整餐输入</button><button class="button" data-action="add-food">${icon('plus')}记录一餐</button></div>`) +
    (!s.profile ? `<div class="onboard"><div><h3>先认识你，才能找到你的平衡</h3><p>填写身体数据，生成属于你的每日热量参考。</p></div><button class="button small" data-action="settings">设置我的目标 ${icon('arrow')}</button></div>` : '') +
    `<div class="dashboard-grid"><div class="stack"><section class="panel energy-panel"><div class="panel-header"><h2>${selectedDate === localDate() ? '今日' : '当日'}热量预算</h2><span class="pill">${s.profile ? ({ lose: '稳稳减脂', maintain: '保持平衡', gain: '科学增肌' })[s.profile.goal] : '等待设置目标'}</span></div><div class="energy-body"><div class="energy-ring"><svg viewBox="0 0 190 190" aria-hidden="true"><circle class="ring-track" cx="95" cy="95" r="85"/><circle class="ring-value" cx="95" cy="95" r="85" style="stroke-dashoffset:${534 * (1 - progress)}"/></svg><div class="ring-inner"><div class="label">${s.remaining !== null && s.remaining < 0 ? '超出参考预算' : '距参考摄入还剩'}</div><div class="ring-number">${num(s.remaining === null ? null : Math.abs(s.remaining))}</div><div class="unit">KCAL</div></div></div><div class="energy-math"><div class="math-row">${icon('food')}已摄入<b>${num(s.totals.kcal)}</b></div><div class="math-row">${icon('run')}运动净消耗<b>+${num(s.exercise)}</b></div><div class="math-row final">当日摄入目标<b>${num(s.target)}</b></div></div></div><div class="energy-bottom"><span>${s.meta ? `基础摄入目标 ${num(s.meta.target)} + 运动 ${num(s.exercise)}` : '设置身体数据后，自动计算参考目标'}</span><button class="text-button" data-action="settings">调整目标 →</button></div></section><div class="metrics">${metric('食物摄入', num(s.totals.kcal), 'kcal', `${s.meals.length} 项食物已记录`, 'food', 'orange')}${metric('预计全天消耗', num(s.expenditure), 'kcal', '日常消耗 + 运动净消耗', 'flame', 'blue')}${metric('摄入 − 消耗', signed(s.gap), 'kcal', s.gap === null ? '有饮食记录后计算' : s.complete ? '负值为缺口 · 正值为盈余' : '暂为部分记录，不代表全天', 'chart')}</div>${mealPanel(s)}</div><div class="stack">${macroPanel(s)}${exercisePanel(s)}<section class="panel tip-card"><div class="tip-label">${icon('leaf')}轻衡小贴士</div><h3>吃得明白，比吃得更少更重要。</h3><p>“一碗”不是固定重量。第一次可以称一称，再按照自己的碗调整份量。记得记录烹饪油和酱料。</p></section></div></div>`;
}
function foodCards() {
  const matched = searchFoods(allFoods(), foodQuery, foodCategory);
  return `<p class="result-info">${foodError ? esc(foodError) : `找到 ${matched.length.toLocaleString('zh-CN')} 种食物 · 数值均为每 100 克可食部分 · 生熟请区分`}</p><div class="food-grid">${matched.slice(0, foodLimit).map(f => `<button class="food-card" data-action="select-food" data-id="${esc(f.id)}"><span class="food-category">${esc(f.category)} / ${f.id.startsWith('usda-') ? 'USDA' : '自定义'}</span><h3>${esc(f.name)}</h3><p>参考 1 ${esc(f.unit)} ≈ ${num(f.portion, 1)} 克</p><div class="food-bottom"><b>${num(f.kcal)}<small>kcal / 100g</small></b>${icon('plus')}</div></button>`).join('')}</div>${!matched.length ? empty('search', '暂时没有找到', '试试英文关键词，或按包装营养表添加自定义食物。') : ''}${matched.length > foodLimit ? '<div class="center" style="margin-top:23px"><button class="button secondary" data-action="more-foods">显示更多食物</button></div>' : ''}`;
}
function foodsPage() {
  return heading('KNOW WHAT NOURISHES YOU', '食物资料库', '真实开放数据，记录你吃下的每一份营养。', `<button class="button" data-action="custom-food">${icon('plus')}自定义食物</button>`) +
    `<section class="panel"><label class="search-box">${icon('search')}<input type="search" id="food-search" placeholder="搜索米饭、鸡蛋、鸡胸肉… 或英文关键词" value="${esc(foodQuery)}" aria-label="搜索食物"></label><div class="chips">${categories.map(c => `<button class="chip ${c === foodCategory ? 'active' : ''}" data-action="filter-foods" data-category="${c}" aria-pressed="${c === foodCategory}">${c}</button>`).join('')}</div><div id="food-cards">${foodCards()}</div><div class="note">USDA FoodData Central · SR Legacy（2018 年 4 月）。常用条目已添加中文名，其余保留英文原名。没有找到中式菜品？可按营养标签建立自己的食物。份量为可修改的估计值，不是统一标准。</div></section>`;
}
function trendsPage() {
  const dates = Array.from({ length: period }, (_, i) => shiftDate(selectedDate, i - period + 1));
  const days = dates.map(date => ({ date, ...summary(state, date) }));
  const recorded = days.filter(d => d.meals.length);
  const complete = recorded.filter(d => d.complete && d.gap !== null);
  const max = Math.max(1000, ...recorded.flatMap(d => [d.totals.kcal, d.expenditure ?? 0]));
  const weights = state.weights.filter(w => w.date >= dates[0] && w.date <= selectedDate).sort((a, b) => a.date.localeCompare(b.date));
  const low = weights.length ? Math.min(...weights.map(w => w.value)) : 0;
  const high = weights.length ? Math.max(...weights.map(w => w.value)) : 0;
  const pts = weights.map(w => { const index = dates.indexOf(w.date); return { x: 20 + index / (period - 1) * 560, y: 105 - (w.value - low) / Math.max(1, high - low) * 80, ...w }; });
  return heading('SEE YOUR SMALL STEPS ADD UP', '每一点改变，都有迹可循。', '未记录的日期保留为空白，不会计为零摄入或热量缺口。', '<button class="button" data-action="weight">记录体重</button>') +
    `<div class="metrics trend-stats">${metric('有饮食记录', `${recorded.length} / ${period}`, '天', '记录比完美更重要', 'clock')}${metric('平均摄入', recorded.length ? num(recorded.reduce((s, d) => s + d.totals.kcal, 0) / recorded.length) : '—', 'kcal', '仅按有记录日期计算', 'food')}${metric('完整记录平均热量差', complete.length ? signed(complete.reduce((s, d) => s + d.gap, 0) / complete.length) : '—', 'kcal', `${complete.length} 天已记全且有身体数据`, 'chart')}</div><div class="stack"><section class="panel"><div class="panel-header"><h2>摄入与消耗</h2><div class="period-switch"><button class="chip ${period === 7 ? 'active' : ''}" data-action="period" data-days="7">7 天</button><button class="chip ${period === 14 ? 'active' : ''}" data-action="period" data-days="14">14 天</button></div></div><div class="legend"><span><i></i>已记录摄入</span><span><i class="pale"></i>估算全天消耗</span><span>峰值 ${num(max)} kcal</span></div><div class="chart-wrap" role="img" aria-label="近${period}天摄入与消耗柱状图，详细数据见下表">${days.map(d => `<div class="chart-column" title="${d.date}：${d.meals.length ? `摄入 ${num(d.totals.kcal)}，消耗 ${num(d.expenditure)}` : '未记录饮食'}">${d.meals.length ? `<div class="chart-bar" style="height:${d.totals.kcal / max * 100}%"></div>${d.expenditure !== null ? `<div class="chart-bar expenditure" style="height:${d.expenditure / max * 100}%"></div>` : ''}` : '<span class="chart-nodata"></span>'}<span class="chart-label">${Number(d.date.slice(5, 7))}/${Number(d.date.slice(8))}</span></div>`).join('')}</div></section><section class="panel"><div class="panel-header"><h2>体重变化</h2><span class="pill">${weights.length} 次记录</span></div>${weights.length ? `<svg class="weight-spark" viewBox="0 0 600 145" role="img" aria-label="体重趋势，数据列于下表"><polyline points="${pts.map(p => `${p.x},${p.y}`).join(' ')}" fill="none"/>${pts.map(p => `<circle cx="${p.x}" cy="${p.y}" r="4"><title>${p.date}：${p.value} kg</title></circle><text x="${p.x}" y="${p.y - 12}" text-anchor="middle">${num(p.value, 1)}</text>`).join('')}<text x="20" y="140">${dates[0]}</text><text x="580" y="140" text-anchor="end">${selectedDate}</text></svg>` : empty('chart', '变化，需要一点时间', '记录真实体重，慢慢看见趋势。')}</section><section class="panel"><div class="panel-header"><h2>每日记录</h2><span class="small-text muted">点击日期查看明细</span></div><div class="table-scroll"><table class="history-table"><thead><tr><th>日期</th><th>摄入 kcal</th><th>消耗 kcal</th><th>热量差 kcal</th><th>体重 kg</th><th>记录状态</th></tr></thead><tbody>${[...days].reverse().map(d => `<tr><td><button class="text-button" data-action="open-day" data-date="${d.date}">${d.date}</button></td><td>${d.meals.length ? num(d.totals.kcal) : '—'}</td><td>${num(d.expenditure)}</td><td>${signed(d.gap)}</td><td>${num(state.weights.find(w => w.date === d.date)?.value, 1)}</td><td>${d.meals.length ? d.complete ? '已记全' : '部分记录' : '未记录饮食'}</td></tr>`).join('')}</tbody></table></div></section></div>`;
}
function inputField(name, label, value, min, max, step = '1', placeholder = '') {
  return `<label class="field">${label}<input name="${name}" type="number" value="${esc(value ?? '')}" min="${min}" max="${max}" step="${step}" placeholder="${placeholder}" required inputmode="decimal"></label>`;
}
function settingsPage() {
  const p = profileAt(state, selectedDate), m = p ? metabolism(p) : null;
  return heading('YOUR BODY, YOUR OWN PACE', '找到属于你的平衡。', '所有身体数据仅保存在此浏览器，不会上传到服务器。') +
    `<div class="settings-grid"><section class="panel"><div class="panel-header"><h2>身体档案</h2><span class="pill">${selectedDate} 起生效</span></div><form id="profile-form"><div class="form-grid"><label class="field">代谢公式性别参数<select name="sex" required><option value="">请选择</option><option value="female" ${p?.sex === 'female' ? 'selected' : ''}>女（公式常数 −161）</option><option value="male" ${p?.sex === 'male' ? 'selected' : ''}>男（公式常数 +5）</option></select></label>${inputField('age', '年龄 / 岁', p?.age, 18, 100, '1', '18–100')}${inputField('height', '身高 / 厘米', p?.height, 100, 230, '0.1', '例如 170')}${inputField('weight', '体重 / 公斤', p?.weight, 30, 300, '0.1', '例如 65')}<label class="field full">日常活动量（不含另行记录的健身）<select name="activity"><option value="1.2" ${!p || p.activity === 1.2 ? 'selected' : ''}>以久坐为主 · 办公 / 学习（×1.20）</option><option value="1.35" ${p?.activity === 1.35 ? 'selected' : ''}>经常站立走动 · 非运动活动（×1.35）</option><option value="1.5" ${p?.activity === 1.5 ? 'selected' : ''}>体力工作较多 · 非运动活动（×1.50）</option></select><small>不要把已计入此活动量的通勤、工作重复记为运动。</small></label><label class="field full">当前目标<select name="goal"><option value="maintain" ${!p || p.goal === 'maintain' ? 'selected' : ''}>保持体重 · 维持能量平衡</option><option value="lose" ${p?.goal === 'lose' ? 'selected' : ''}>温和减脂 · 参考每日减少 300 kcal</option><option value="gain" ${p?.goal === 'gain' ? 'selected' : ''}>增肌增重 · 参考每日增加 200 kcal</option></select></label></div><div class="note">本次设置从 ${selectedDate} 起生效，直到下一次身体档案；此前日期不受影响。运动消耗在记录时固定，不会被之后的体重变化改写。</div><p class="modal-error" id="profile-error" role="alert"></p><div class="form-actions"><button class="button" type="submit">${icon('check')}保存身体与目标</button></div></form></section><div class="stack"><section class="panel"><div class="panel-header"><h2>你的每日参考</h2>${icon('leaf')}</div><div class="formula"><span>基础代谢 BMR</span><b>${num(m?.bmr)} kcal</b></div><div class="formula"><span>不含额外运动的日常消耗</span><b>${num(m?.base)} kcal</b></div><div class="formula"><span>基础摄入目标</span><b>${num(m?.target)} kcal</b></div><div class="formula"><span>身体质量指数 BMI</span><b>${num(m?.bmi, 1)}</b></div><div class="note ${m?.bmi < 18.5 ? 'warn' : ''}">${m?.bmi < 18.5 ? 'BMI 低于 18.5 时不自动设置减脂缺口，建议先咨询专业人士。' : '使用 Mifflin–St Jeor 公式估算；每日目标随额外运动净消耗增加。减脂目标不低于估算基础代谢。'}</div><p class="small-text muted">面向一般成年人，不适用于未成年人、孕哺期或需要医学营养管理的人群。热量与代谢均为估算，并非医疗建议。</p></section><section class="panel"><div class="panel-header"><h2>数据，掌握在自己手里</h2>${icon('download')}</div><p class="small-text muted">清理浏览器数据或更换设备会丢失记录。请定期备份；备份包含身体和饮食信息，请妥善保管。</p><div class="data-actions"><button class="button secondary small" data-action="export">导出全部记录</button><button class="button secondary small" data-action="import">恢复备份</button></div><input type="file" id="import-file" accept="application/json,.json" hidden><div class="data-actions"><button class="text-button" data-action="about">数据来源、计算方式与部署说明 →</button></div></section></div></div>`;
}
function render() {
  const route = location.hash.slice(1);
  tab = ['dashboard', 'foods', 'trends', 'settings'].includes(route) ? route : 'dashboard';
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.classList.toggle('active', el.dataset.nav === tab);
    if (el.dataset.nav === tab) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
  });
  $('#page-name').textContent = { dashboard: '每日概览', foods: '食物资料库', trends: '记录与趋势', settings: '身体与目标' }[tab];
  $('#date').value = selectedDate; $('#date').max = localDate();
  $('#next-day').disabled = selectedDate >= localDate();
  $('#main').innerHTML = ({ dashboard, foods: foodsPage, trends: trendsPage, settings: settingsPage })[tab]();
  $('#complete-day')?.addEventListener('change', async e => {
    if (await mutate(s => { s.completedDays = s.completedDays.filter(d => d !== selectedDate); if (e.target.checked) s.completedDays.push(selectedDate); })) toast(e.target.checked ? '已标记当天饮食记录完整' : '已改为部分记录');
    render();
  });
  $('#food-search')?.addEventListener('input', e => { foodQuery = e.target.value; foodLimit = 36; $('#food-cards').innerHTML = foodCards(); });
  $('#profile-form')?.addEventListener('submit', saveProfile);
  $('#import-file')?.addEventListener('change', importBackup);
}
function setDate(date) {
  if (!validDate(date) || date > localDate()) { toast('请选择今天或之前的有效日期'); $('#date').value = selectedDate; return; }
  selectedDate = date; render();
}
function openModal(title, body) {
  $('#modal').oncancel = null;
  $('#modal-content').innerHTML = `<div class="modal-head"><h2 id="modal-title">${esc(title)}</h2><button class="icon-button" data-action="close" aria-label="关闭窗口">${icon('close')}</button></div>${body}`;
  if (!$('#modal').open) $('#modal').showModal();
}
function closeModal() { $('#modal').close(); selectedFood = null; editingMeal = null; }
let pickerMeal = '早餐';
function openPicker(meal = '早餐') {
  pickerMeal = meal; selectedFood = null; editingMeal = null;
  openModal(`记录${meal}`, `<p class="modal-intro">记录到 ${selectedDate} · 先选食物，再填写克数或份数</p><label class="search-box">${icon('search')}<input id="picker-search" type="search" placeholder="搜索米饭、鸡蛋… 或英文关键词" aria-label="查找要记录的食物"></label><p class="result-info">${foodError ? esc(foodError) : '常用食物 · USDA 开放数据 / 自定义食物'}</p><div id="picker-results" class="modal-results"></div><div class="form-actions"><button class="button secondary" data-action="whole-meal" data-meal="${meal}">整餐输入 / 自动拆分</button><button class="button secondary" data-action="custom-food">找不到？自定义食物</button></div>`);
  const results = query => {
    const found = searchFoods(allFoods(), query);
    $('#picker-results').innerHTML = found.slice(0, 50).map(f => `<button class="food-result" data-action="select-food" data-id="${esc(f.id)}"><div><h3>${esc(f.name)}</h3><p>${esc(f.category)} · 参考 1 ${esc(f.unit)} ≈ ${num(f.portion, 1)} 克</p></div><strong>${num(f.kcal)} <small>kcal / 100g</small></strong></button>`).join('') + (found.length > 50 ? '<p class="result-info">显示前 50 项，请输入更具体的关键词。</p>' : !found.length ? '<p class="result-info">没有匹配食物，可以按营养表自定义添加。</p>' : '');
  };
  results(''); $('#picker-search').addEventListener('input', e => results(e.target.value)); $('#picker-search').focus();
}
function foodAmount(food, existing = null) {
  selectedFood = food; editingMeal = existing;
  const mode = existing?.mode ?? 'grams';
  const portion = existing?.portion ?? food.portion;
  openModal(existing ? '修改食物记录' : '这一餐，吃了多少？', `<p class="modal-intro"><strong>${esc(food.name)}</strong><br>${esc(food.description)}<br>${food.id.startsWith('usda-') ? `USDA · FDC ${esc(food.fdcId ?? food.id.slice(5))}` : '你的自定义食物'} · ${num(food.kcal)} kcal / 100g</p><form id="amount-form"><div class="form-grid"><label class="field">记录餐次<select name="meal">${MEALS.map(m => `<option ${m === (existing?.meal ?? pickerMeal) ? 'selected' : ''}>${m}</option>`).join('')}</select></label><label class="field">计量方式<select name="mode"><option value="grams" ${mode === 'grams' ? 'selected' : ''}>按克数</option><option value="portion" ${mode === 'portion' ? 'selected' : ''}>按数量 / ${esc(food.unit)}</option></select></label>${inputField('quantity', '食用数量', existing?.quantity ?? 100, .00001, 10000, 'any')}<label class="field" id="portion-field" ${mode === 'grams' ? 'hidden' : ''}>每 ${esc(food.unit)} 的克数<input name="portion" type="number" min="0.1" max="10000" step="0.1" value="${portion}" required inputmode="decimal"><small>按可食部分称重，不含壳、核或骨头。</small></label></div><div class="nutrition-preview" id="amount-preview" aria-live="polite"></div><p class="small-text muted" id="gram-detail"></p><div class="note">按数量计算：数量 × 每份克数 × 每 100 克热量 ÷ 100。默认份量仅供参考，碗、片和个的大小不同，请按实际调整。</div><p class="modal-error" id="amount-error" role="alert"></p><div class="form-actions"><button type="button" class="button secondary" data-action="close">取消</button><button class="button" type="submit">${icon('check')}${existing ? '保存修改' : '加入这一餐'}</button></div></form>`);
  const form = $('#amount-form');
  let amountMode = mode, lastValidGrams = existing?.grams ?? 100;
  const preview = () => {
    if (form.elements.mode.value !== amountMode) return;
    form.elements.portion.disabled = amountMode === 'grams';
    $('#portion-field').hidden = amountMode === 'grams';
    const data = new FormData(form), qty = Number(data.get('quantity')), grams = amountMode === 'grams' ? qty : qty * Number(data.get('portion'));
    const valid = inRange(grams, .1, 10000);
    if (valid) lastValidGrams = grams;
    const n = valid ? nutrition(food, grams) : null;
    $('#amount-preview').innerHTML = [['kcal', '热量 / kcal'], ['protein', '蛋白质 / g'], ['carbs', '碳水 / g'], ['fat', '脂肪 / g']].map(([k, label]) => `<div><b>${num(n?.[k], k === 'kcal' ? 0 : 1)}</b><span>${label}</span></div>`).join('');
    $('#gram-detail').textContent = valid ? `合计 ${num(grams, 2)} 克 · 记录到 ${selectedDate}` : '总重量需在 0.1–10000 克之间';
  };
  form.elements.mode.addEventListener('change', () => {
    const currentPortion = Number(form.elements.portion.value);
    const grams = Number(form.elements.quantity.value) * (amountMode === 'grams' ? 1 : currentPortion);
    if (inRange(grams, .1, 10000)) lastValidGrams = grams;
    const validPortion = inRange(currentPortion, .1, 10000) ? currentPortion : food.portion;
    amountMode = form.elements.mode.value;
    form.elements.portion.value = validPortion;
    form.elements.quantity.value = amountMode === 'grams' ? lastValidGrams : lastValidGrams / validPortion;
    preview();
  });
  form.addEventListener('input', preview); preview();
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const values = new FormData(form), mode = values.get('mode'), quantity = Number(values.get('quantity')), portion = mode === 'grams' ? Number(form.elements.portion.value) : Number(values.get('portion'));
    const grams = mode === 'grams' ? quantity : quantity * portion;
    if (!inRange(grams, .1, 10000)) { $('#amount-error').textContent = '总重量需在 0.1–10000 克之间'; return; }
    const record = { id: existing?.id ?? uid(), date: existing?.date ?? selectedDate, meal: values.get('meal'), food: structuredClone(food), grams, quantity, mode, portion };
    if (await mutate(s => { s.meals = s.meals.filter(m => m.id !== record.id); s.meals.push(record); s.completedDays = s.completedDays.filter(d => d !== record.date); })) {
      closeModal(); render(); toast(existing ? '已更新食物记录' : '已记下这一餐');
    }
  });
}
function openWholeMeal(meal = '早餐', source = '') {
  openModal('整餐输入', `<p class="modal-intro">记录到 ${selectedDate} · 用 +、逗号、顿号、换行或“和”分开食物，再逐项确认。</p><form id="whole-meal-form"><label class="field">默认餐次<select name="meal">${MEALS.map(m => `<option ${m === meal ? 'selected' : ''}>${m}</option>`).join('')}</select></label><label class="field whole-text">这一餐吃了什么？<textarea name="text" rows="5" maxlength="2000" required placeholder="晚餐吃麦当劳双层板烧鸡腿堡+中薯条+无糖可口可乐">${esc(source)}</textarea></label><div class="note">也可以输入：午餐吃白米饭150克、两只水煮鸡蛋和香蕉1根。未写数量时暂按 1 份，规格、品牌和重量都需要核对；不会凭空生成营养数据。</div><p id="whole-error" class="modal-error" role="alert"></p><div class="form-actions"><button class="button" type="submit">拆分并核对</button></div></form>`);
  $('#whole-meal-form [name="meal"]').value = meal;
  $('#whole-meal-form').addEventListener('submit', event => {
    event.preventDefault();
    const values = new FormData(event.target);
    try {
      const parsed = parseMealText(values.get('text'), values.get('meal'));
      const rows = parsed.items.map(item => {
        const candidates = mealFoodCandidates(allFoods(), item);
        const exact = candidates.filter(food => food.name.toLowerCase() === `${item.brand}${item.name}`.toLowerCase());
        const food = exact.length === 1 && !item.size ? exact[0] : null;
        const unit = item.mode === 'portion' ? item.unit : '';
        return { ...item, unit, food, query: [item.brand, item.name].filter(Boolean).join(' '), portion: food && (!unit || unit === food.unit) ? food.portion : null };
      });
      showWholeMeal({ date: selectedDate, meal: parsed.meal, source: values.get('text'), rows });
    } catch (error) { $('#whole-error').textContent = error.message; }
  });
  $('#whole-meal-form textarea').focus();
}
function showWholeMeal(draft) {
  openModal('逐项核对这一餐', `<p class="modal-intro">${esc(draft.date)} · 每项选择准确的食品和可食重量后，一次加入记录。修改搜索词可手动重新匹配。</p><form id="whole-review"><label class="field">记录餐次<select name="meal">${MEALS.map(m => `<option ${m === draft.meal ? 'selected' : ''}>${m}</option>`).join('')}</select></label><div class="whole-rows">${draft.rows.map((row, index) => `<section class="whole-row" data-row="${index}"><div class="panel-header"><h3>${index + 1}. ${esc(row.raw)}</h3><button type="button" class="text-button" data-remove="${index}">移除</button></div><p class="small-text muted">${esc([row.brand && `品牌：${row.brand}`, row.size && `规格：${row.size}`, row.volume ? '容量不能直接当克数，请称重后填写' : row.explicitQuantity ? '已识别数量，请核对计量单位' : '未写数量，暂按 1 份'].filter(Boolean).join(' · '))}</p><label class="field">搜索对应食品<input type="search" data-field="query" value="${esc(row.query)}" maxlength="240"></label><label class="field">匹配结果<select data-field="food" aria-label="第${index + 1}项食物"></select></label><p class="small-text muted" data-source></p><div class="form-grid"><label class="field">计量方式<select data-field="mode"><option value="grams" ${row.mode === 'grams' ? 'selected' : ''}>按克数</option><option value="portion" ${row.mode === 'portion' ? 'selected' : ''}>按数量 / ${esc(row.unit || row.food?.unit || '份')}</option></select></label><label class="field">${row.mode === 'grams' ? '可食总重量 / 克' : `数量 / ${esc(row.unit || row.food?.unit || '份')}`}<input type="number" data-field="quantity" min="0.00001" max="10000" step="any" required value="${row.quantity ?? ''}"></label><label class="field full" ${row.mode === 'grams' ? 'hidden' : ''}>每 ${esc(row.unit || row.food?.unit || '份')} 的可食重量 / 克<input type="number" data-field="portion" min="0.1" max="10000" step="any" required ${row.mode === 'grams' ? 'disabled' : ''} value="${row.portion ?? ''}" placeholder="请确认该规格的实际重量"></label></div><div class="whole-row-footer"><output data-kcal aria-live="polite"></output><button type="button" class="text-button" data-custom="${index}">按营养表自定义</button></div></section>`).join('')}</div><div class="note">默认每份克数只是参考；不同地区、品牌、大小和烹调方式不能混用。未匹配或重量无效的项目不会作为 0 kcal 计入合计，可补充或移除。</div><p id="whole-total" class="whole-total" aria-live="polite"></p><p id="whole-save-error" class="modal-error" role="alert"></p><div class="form-actions"><button type="button" class="button secondary" id="whole-back">返回修改原文</button><button class="button" id="whole-save" type="submit">确认加入这餐</button></div></form>`);
  const form = $('#whole-review');
  form.elements.meal.value = draft.meal;
  const rowGrams = row => row.food && inRange(row.quantity, .00001, 10000) && (row.mode === 'grams' || inRange(row.portion, .1, 10000)) ? row.quantity * (row.mode === 'grams' ? 1 : row.portion) : null;
  const updateTotals = () => {
    let total = 0, unresolved = 0;
    draft.rows.forEach((row, index) => {
      const grams = rowGrams(row), valid = inRange(grams, .1, 10000);
      if (valid) total += nutrition(row.food, grams).kcal; else unresolved++;
      $(`[data-row="${index}"] [data-kcal]`, form).textContent = valid ? `${num(nutrition(row.food, grams).kcal, 1)} kcal · ${num(grams, 1)} 克` : row.food ? '待确认有效重量' : '待匹配，不计入合计';
    });
    $('#whole-total').textContent = `已知热量合计 ${num(total, 1)} kcal${unresolved ? ` · ${unresolved} 项待补充` : ` · ${draft.rows.length} 项已就绪`}`;
    $('#whole-save').disabled = !draft.rows.length || unresolved > 0;
  };
  draft.rows.forEach((row, index) => {
    const section = $(`[data-row="${index}"]`, form);
    const select = $('[data-field="food"]', section);
    const choices = () => {
      const matches = row.query.trim() ? searchFoods(allFoods(), row.query) : [];
      const found = matches.slice(0, 30);
      if (row.food && !found.some(f => f.id === row.food.id)) found.unshift(row.food);
      select.innerHTML = '<option value="">请选择匹配食品（不自动替代）</option>' + found.map(food => `<option value="${esc(food.id)}" ${food.id === row.food?.id ? 'selected' : ''}>${esc(food.name)} · ${num(food.kcal)} kcal/100g</option>`).join('');
      select.value = row.food?.id ?? '';
      $('[data-source]', section).textContent = row.food ? `${row.food.description} · ${row.food.id.startsWith('usda-') ? `USDA ${row.food.id}` : '自定义营养表'} · 默认份量仅供参考` : `${matches.length ? `找到 ${matches.length} 项候选，最多显示 30 项，请核对生熟、品牌及规格` : '没有匹配食品，请调整搜索词或按营养表自定义'}${foodError ? ` · ${foodError}` : ''}`;
    };
    choices();
    $('[data-field="query"]', section).addEventListener('input', event => {
      row.query = event.target.value; row.food = null; row.portion = null;
      $('[data-field="portion"]', section).value = ''; choices(); updateTotals();
    });
    select.addEventListener('change', () => {
      row.food = allFoods().find(food => food.id === select.value) ?? null;
      row.portion = row.food && !row.size && (!row.unit || row.unit === row.food.unit) ? row.food.portion : null;
      showWholeMeal(draft);
    });
    for (const field of ['quantity', 'portion']) $('[data-field="' + field + '"]', section).addEventListener('input', event => {
      row[field] = event.target.value === '' ? null : Number(event.target.value); updateTotals();
    });
    $('[data-field="mode"]', section).addEventListener('change', event => {
      const grams = rowGrams(row);
      row.mode = event.target.value;
      row.quantity = inRange(grams, .1, 10000) ? row.mode === 'grams' ? grams : inRange(row.portion, .1, 10000) ? grams / row.portion : null : null;
      showWholeMeal(draft);
    });
    $('[data-remove]', section).addEventListener('click', () => { draft.rows.splice(index, 1); showWholeMeal(draft); });
    $('[data-custom]', section).addEventListener('click', () => openCustomFood({
      name: [row.brand, row.name, row.size].filter(Boolean).join(' '),
      unit: row.unit || row.food?.unit || '份', portion: row.portion,
      onCancel: () => showWholeMeal(draft),
      onSave: food => {
        row.food = food;
        row.unit ||= food.unit;
        row.portion = row.unit !== food.unit ? null : inRange(row.portion, .1, 10000) ? row.portion : food.portion;
        showWholeMeal(draft);
      },
    }));
  });
  form.elements.meal.addEventListener('change', event => { draft.meal = event.target.value; });
  $('#whole-back').addEventListener('click', () => {
    if (confirm('返回原文会重新拆分，当前匹配和数量修改不会保留。继续？')) openWholeMeal(draft.meal, draft.source);
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!draft.rows.length || draft.rows.some(row => !inRange(rowGrams(row), .1, 10000))) { $('#whole-save-error').textContent = '请先匹配所有食品并确认有效重量，或移除不记录的项目。'; return; }
    const records = draft.rows.map(row => ({ id: uid(), date: draft.date, meal: draft.meal, food: { ...structuredClone(row.food), unit: row.mode === 'portion' ? row.unit || row.food.unit : row.food.unit }, grams: rowGrams(row), quantity: row.quantity, mode: row.mode, portion: row.mode === 'grams' ? row.food.portion : row.portion }));
    if (await mutate(s => { s.meals.push(...records); s.completedDays = s.completedDays.filter(date => date !== draft.date); })) {
      closeModal(); render(); toast(`已一次记录 ${records.length} 项食物`);
    }
  });
  updateTotals();
}
function openCustomFood(context = null) {
  openModal('添加自己的食物', `<p class="modal-intro">根据包装营养成分表填写，每 100 克的数据。仅保存在你的食物库。</p><form id="custom-form"><div class="form-grid"><label class="field full">食物名称<input name="name" maxlength="120" placeholder="例如：家里的全麦吐司" required></label><label class="field">食物类别<select name="category">${categories.slice(1).map(c => `<option>${c}</option>`).join('')}</select></label><label class="field">包装热量单位<select name="energyUnit"><option value="kcal">千卡 kcal</option><option value="kJ">千焦 kJ</option></select></label>${inputField('energy', '每 100 克热量', null, 0, 4184, '0.01')}<label class="field">数量单位<input name="unit" value="份" maxlength="20" required></label>${inputField('portion', '每份可食部分 / 克', 100, .1, 10000, '0.1')}${['protein', 'carbs', 'fat'].map((k, i) => `<label class="field">${['蛋白质', '碳水化合物', '脂肪'][i]} / g（每 100g）<input name="${k}" type="number" min="0" max="100" step="0.01" placeholder="未知可留空" inputmode="decimal"></label>`).join('')}</div><div class="note">千卡 = 千焦 ÷ 4.184。请勿将“每份”或“每 100 毫升”直接当作“每 100 克”；液体可先称重，再换算到每 100 克。</div><p id="custom-error" class="modal-error" role="alert"></p><div class="form-actions"><button type="button" class="button secondary" data-action="close">取消</button><button class="button" type="submit">保存并记录</button></div></form>`);
  if (context) {
    $('#custom-form [name="name"]').value = context.name;
    $('#custom-form [name="unit"]').value = context.unit;
    if (inRange(context.portion, .1, 10000)) $('#custom-form [name="portion"]').value = context.portion;
    $('#custom-form [data-action="close"]').textContent = '返回整餐核对';
    for (const back of $('#modal-content').querySelectorAll('[data-action="close"]')) {
      back.removeAttribute('data-action'); back.setAttribute('aria-label', '返回整餐核对'); back.onclick = context.onCancel;
    }
    $('#modal').oncancel = event => { event.preventDefault(); context.onCancel(); };
    $('#custom-form [type="submit"]').textContent = '保存并返回整餐';
  }
  $('#custom-form').addEventListener('submit', async e => {
    e.preventDefault(); const v = new FormData(e.target);
    const food = { id: `custom-${uid()}`, name: v.get('name').trim(), description: '用户根据营养成分表录入', category: v.get('category'), kcal: Number(v.get('energy')) / (v.get('energyUnit') === 'kJ' ? 4.184 : 1), portion: Number(v.get('portion')), unit: v.get('unit').trim(), featured: true };
    for (const key of ['protein', 'carbs', 'fat']) food[key] = v.get(key) === '' ? null : Number(v.get(key));
    if (!validateFood(food)) { $('#custom-error').textContent = '请检查名称和数值，热量应为 0–1000 kcal / 100g。'; return; }
    if (await mutate(s => s.customFoods.push(food))) { render(); if (context) context.onSave(food); else foodAmount(food); toast('已保存到自定义食物库'); }
  });
}
function openExercise() {
  const p = profileAt(state, selectedDate);
  if (!p) { toast('请先填写身体档案，以便按体重估算运动消耗'); location.hash = 'settings'; return; }
  openModal('为今天的运动，记上一笔', `<p class="modal-intro">${selectedDate} · 按 ${num(p.weight, 1)} kg 计算。仅添加日常活动之外的运动。</p><form id="exercise-form"><div class="form-grid"><label class="field full">运动类型<select name="activity">${ACTIVITIES.map((a, i) => `<option value="${i}">${a.name}（MET ${a.met}）</option>`).join('')}<option value="manual">手动填写额外消耗</option></select></label>${inputField('minutes', '持续时间 / 分钟', 30, 1, 600)}<div id="exercise-manual" class="full" hidden><div class="form-grid"><label class="field">运动名称<input name="name" value="其他运动" maxlength="120"></label><label class="field">额外净消耗 / kcal<input name="kcal" type="number" min="0" max="10000" step="0.1" inputmode="decimal"></label></div></div></div><div class="nutrition-preview"><div><b id="exercise-preview">—</b><span>额外净消耗 / kcal</span></div></div><div class="note">MET 估算：(MET − 1) × 3.5 × 体重 ÷ 200 × 分钟，扣除运动期间的静息消耗。手动填写手表“活动热量”，不要填写包含静息的“总热量”。</div><p id="exercise-error" class="modal-error" role="alert"></p><div class="form-actions"><button type="button" class="button secondary" data-action="close">取消</button><button type="submit" class="button">保存运动记录</button></div></form>`);
  const form = $('#exercise-form');
  const preview = () => {
    const manual = form.elements.activity.value === 'manual', minutes = Number(form.elements.minutes.value);
    $('#exercise-manual').hidden = !manual; form.elements.kcal.required = manual; form.elements.name.required = manual;
    form.elements.kcal.disabled = !manual; form.elements.name.disabled = !manual;
    let kcal = null;
    if (manual) kcal = form.elements.kcal.value === '' ? null : Number(form.elements.kcal.value);
    else if (inRange(minutes, 1, 600)) kcal = exerciseCalories(ACTIVITIES[Number(form.elements.activity.value)].met, p.weight, minutes);
    $('#exercise-preview').textContent = num(kcal);
  };
  form.addEventListener('input', preview); form.addEventListener('change', preview); preview();
  form.addEventListener('submit', async event => {
    event.preventDefault(); const v = new FormData(form), manual = v.get('activity') === 'manual', activity = manual ? null : ACTIVITIES[Number(v.get('activity'))];
    const minutes = Number(v.get('minutes')), kcal = manual ? Number(v.get('kcal')) : exerciseCalories(activity.met, p.weight, minutes);
    const name = manual ? v.get('name').trim() : activity.name;
    if (!name || !inRange(kcal, 0, 10000)) { $('#exercise-error').textContent = '请填写有效的运动名称和净消耗'; return; }
    if (await mutate(s => s.exercises.push({ id: uid(), date: selectedDate, name, minutes, weight: p.weight, kcal, met: activity?.met ?? null, method: manual ? 'manual' : 'met' }))) { closeModal(); render(); toast('运动已记录，辛苦啦'); }
  });
}
async function saveProfile(event) {
  event.preventDefault(); const v = new FormData(event.target);
  const profile = { date: selectedDate, sex: v.get('sex'), age: Number(v.get('age')), height: Number(v.get('height')), weight: Number(v.get('weight')), activity: Number(v.get('activity')), goal: v.get('goal') };
  if (!validateProfile(profile)) { $('#profile-error').textContent = '请检查身体数据，当前估算仅支持 18–100 岁成年人。'; return; }
  if (await mutate(s => {
    s.profiles = s.profiles.filter(p => p.date !== selectedDate); s.profiles.push(profile);
    s.weights = s.weights.filter(w => w.date !== selectedDate); s.weights.push({ date: selectedDate, value: profile.weight });
  })) { render(); toast('身体档案已保存，热量目标已更新'); }
}
function openWeight() {
  const weight = state.weights.find(w => w.date === selectedDate)?.value ?? profileAt(state, selectedDate)?.weight;
  openModal('记录体重', `<p class="modal-intro">记录到 ${selectedDate}。建议在相似时间、相似状态下称重。</p><form id="weight-form">${inputField('value', '体重 / 公斤', weight, 30, 300, '0.1')}<p class="small-text muted" style="margin-top:14px">同一天的新记录会替换该日体重。体重从这一天起用于后续代谢估算。</p><div class="form-actions"><button class="button" type="submit">保存体重</button></div></form>`);
  $('#weight-form').addEventListener('submit', async e => {
    e.preventDefault(); const value = Number(new FormData(e.target).get('value'));
    if (await mutate(s => { s.weights = s.weights.filter(w => w.date !== selectedDate); s.weights.push({ date: selectedDate, value }); })) { closeModal(); render(); toast('体重记录已保存'); }
  });
}
function download(content, filename) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
async function importBackup(event) {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('备份超过 10 MB，未读取。');
    const imported = validateState(JSON.parse(await file.text()));
    if (!confirm(`恢复备份将替换当前全部个人记录（备份含 ${imported.meals.length} 条饮食、${imported.exercises.length} 条运动）。请先导出当前记录。确定恢复？`)) return;
    if (await save(imported, true)) { render(); toast('备份已恢复'); }
  } catch (error) { toast(error instanceof SyntaxError ? '不是有效的 JSON 备份，现有记录未修改。' : error.message); }
  finally { event.target.value = ''; }
}
function about() {
  openModal('关于轻衡', `<div class="about-copy"><p>轻衡是一个无账号、无追踪的个人热量管理工具。应用运行不需要在线 API，个人记录保存在当前网站、当前浏览器的本地存储中。</p><h3>真实开放食物数据</h3><p>内置 ${foods.length.toLocaleString('zh-CN')} 条 <a href="https://fdc.nal.usda.gov/download-datasets/" target="_blank" rel="noopener noreferrer">USDA FoodData Central · SR Legacy</a> 官方记录（2018 年 4 月版，2026-11-18 获取）。USDA 营养数据属于公共领域。保留原始英文名称和 FDC 编号，常用食物添加中文展示名；数据不代表所有中国菜品。</p><p>热量和营养按每 100 克可食部分计。份数换算是本应用提供的可修改估计，不是 USDA 标准份量。原始数值未经过模型猜测。</p><p><a href="./data/foods.json" download>下载应用食物数据 JSON</a> · <a href="./data/sources.json" target="_blank" rel="noopener">查看数据溯源信息</a></p><h3>热量怎么算</h3><p>基础代谢（Mifflin–St Jeor）= 10 × 体重 kg + 6.25 × 身高 cm − 5 × 年龄 + 性别常数（男 +5，女 −161）。日常消耗 = 基础代谢 × 不含额外运动的日常活动系数；全天消耗 = 日常消耗 + 额外运动净消耗。热量差 = 摄入 − 全天消耗，负值为缺口。</p><p>运动使用常见成人活动 MET 参考估值，不是测量结果。净消耗 = (MET − 1) × 3.5 × 体重 ÷ 200 × 分钟；强度、技术和身体差异会影响实际消耗。仅记录未计入日常系数的运动，避免重复计算。</p><p>减脂参考减少 300 kcal、增重增加 200 kcal；减脂目标不低于估算基础代谢，BMI 低于 18.5 不自动设缺口。营养素比例是一般参考，不代替个体化营养建议。</p><h3>隐私与离线使用</h3><p>无需登录，无云同步。清除站点数据或切换设备会失去本地记录；请在“身体与目标”中导出备份。首次加载完成后可离线使用；浏览器支持时，可通过浏览器菜单“安装应用 / 添加到主屏幕”。</p><h3>部署到 GitHub Pages</h3><ol><li>将项目源码上传至自己的 GitHub 仓库；不要上传本地备份、.tools 或 node_modules。</li><li>仓库 Settings → Pages → Source 选择 GitHub Actions。</li><li>在 Actions 中手动运行 Deploy to GitHub Pages，或向 main 分支推送。</li><li>部署成功后访问 Pages 提供的网址。应用支持仓库子路径，无需配置 API 密钥。</li></ol><p>本地预览：安装 Node.js 22+，运行 npm run dev；测试 npm test，构建 npm run build。此电脑也可双击“启动轻衡.cmd”。</p><div class="note warn">本工具面向一般成年人。未成年人、孕哺期、进食障碍或慢性疾病等情况，请寻求专业指导，不要单凭热量估算限制饮食。</div></div>`);
}

document.addEventListener('click', async e => {
  const button = e.target.closest('[data-action]'); if (!button) return;
  const { action, id } = button.dataset;
  if (action === 'settings') location.hash = 'settings';
  else if (action === 'add-food') openPicker(button.dataset.meal ?? '早餐');
  else if (action === 'whole-meal') openWholeMeal(button.dataset.meal ?? '早餐');
  else if (action === 'select-food') { const food = allFoods().find(f => f.id === id); if (food) foodAmount(food); }
  else if (action === 'edit-meal') { const meal = state.meals.find(m => m.id === id); if (meal) foodAmount(meal.food, meal); }
  else if (action === 'delete-meal' && confirm('删除这条饮食记录？')) {
    if (await mutate(s => { s.meals = s.meals.filter(m => m.id !== id); s.completedDays = s.completedDays.filter(d => d !== selectedDate); })) { render(); toast('饮食记录已删除'); }
  } else if (action === 'delete-exercise' && confirm('删除这条运动记录？')) {
    if (await mutate(s => { s.exercises = s.exercises.filter(x => x.id !== id); })) { render(); toast('运动记录已删除'); }
  } else if (action === 'close') closeModal();
  else if (action === 'add-exercise') openExercise();
  else if (action === 'custom-food') openCustomFood();
  else if (action === 'filter-foods') { foodCategory = button.dataset.category; foodLimit = 36; render(); }
  else if (action === 'more-foods') { foodLimit += 36; $('#food-cards').innerHTML = foodCards(); }
  else if (action === 'period') { period = Number(button.dataset.days); render(); }
  else if (action === 'open-day') { setDate(button.dataset.date); location.hash = 'dashboard'; }
  else if (action === 'weight') openWeight();
  else if (action === 'export') { if (storageBlocked) { toast('请使用上方“下载原始数据”，避免导出空白记录'); return; } download(JSON.stringify(state, null, 2), `light-balance-backup-${localDate()}.json`); toast('备份下载已开始，请妥善保存'); }
  else if (action === 'import') $('#import-file')?.click();
  else if (action === 'about') about();
});
$('#date').addEventListener('change', e => setDate(e.target.value));
$('#prev-day').addEventListener('click', () => setDate(shiftDate(selectedDate, -1)));
$('#next-day').addEventListener('click', () => setDate(shiftDate(selectedDate, 1)));
$('#today').addEventListener('click', () => setDate(localDate()));
window.addEventListener('hashchange', () => { render(); window.scrollTo({ top: 0 }); });
window.addEventListener('storage', e => {
  if (e.key !== storageKey && e.key !== null) return;
  try {
    const current = localStorage.getItem(storageKey);
    state = current ? validateState(JSON.parse(current)) : emptyState(); lastSaved = current;
    storageBlocked = false; $('#storage-warning').hidden = true;
    closeModal(); render(); toast('已同步此浏览器另一个页面的记录');
  } catch { storageBlocked = true; warnStorage('另一个页面写入的数据无法读取，已暂停保存。'); }
});
render();
try {
  const response = await fetch(new URL('./data/foods.json', import.meta.url));
  if (!response.ok) throw new Error('Food dataset unavailable');
  const data = await response.json();
  if (!Array.isArray(data) || !data.every(validateFood)) throw new Error('Invalid dataset');
  foods = data;
} catch { foodError = '内置食物库加载失败。请联网后刷新；自定义食物和已有记录仍可使用。'; }
if (tab === 'foods') render();
if ($('#picker-search')) {
  const query = $('#picker-search').value;
  openPicker(pickerMeal);
  $('#picker-search').value = query;
  $('#picker-search').dispatchEvent(new Event('input'));
}
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => toast('离线缓存未启用；在线记账不受影响'));
}
