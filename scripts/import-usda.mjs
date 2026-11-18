import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(process.argv[2] ?? resolve(root, '.tools/usda/FoodData_Central_sr_legacy_food_json_2018-04.json'));

// Portion weights are editable app estimates, not USDA standard portions.
const curated = new Map([
  [169757, ['Rice, white, long-grain, regular, unenriched, cooked without salt', '白米饭（长粒米，熟，无盐，未强化）', '主食', 150, '碗']],
  [168926, ['Noodles, egg, unenriched, cooked, without added salt', '鸡蛋面（熟，未强化，未加盐）', '主食', 200, '碗']],
  [172688, ['Bread, whole-wheat, commercially prepared', '全麦面包（市售）', '主食', 30, '片']],
  [173904, ['Cereals, oats, regular and quick, not fortified, dry', '燕麦片（干，普通或快熟，未强化）', '主食', 40, '份']],
  [169704, ["Rice, brown, long-grain, cooked (Includes foods for USDA's Food Distribution Program)", '糙米饭（长粒米，熟）', '主食', 150, '碗']],
  [168484, ['Sweet potato, cooked, boiled, without skin', '红薯（去皮水煮）', '主食', 150, '份']],
  [169999, ['Corn, sweet, yellow, cooked, boiled, drained, without salt', '黄色甜玉米粒（水煮沥干，无盐）', '主食', 100, '份']],
  [173424, ['Egg, whole, cooked, hard-boiled', '水煮鸡蛋（全蛋，熟，可食部）', '蛋奶豆', 50, '个']],
  [172217, ['Milk, whole, 3.25% milkfat, without added vitamin A and vitamin D', '全脂牛奶（脂肪3.25%，未添加维生素A和D）', '蛋奶豆', 250, '杯']],
  [171284, ['Yogurt, plain, whole milk', '原味全脂酸奶', '蛋奶豆', 150, '杯']],
  [172476, ['Tofu, raw, regular, prepared with calcium sulfate', '普通豆腐（生，硫酸钙凝固）', '蛋奶豆', 100, '份']],
  [172421, ['Lentils, mature seeds, cooked, boiled, without salt', '小扁豆（成熟豆粒，水煮，无盐）', '蛋奶豆', 100, '份']],
  [172183, ['Egg, white, raw, fresh', '鸡蛋蛋清（生，新鲜）', '蛋奶豆', 30, '个']],
  [171477, ['Chicken, broilers or fryers, breast, meat only, cooked, roasted', '鸡胸肉（仅肉，烤熟）', '肉类海鲜', 100, '份']],
  [175168, ['Fish, salmon, Atlantic, farmed, cooked, dry heat', '大西洋三文鱼（养殖，干热烹熟）', '肉类海鲜', 100, '份']],
  [175180, ['Crustaceans, shrimp, cooked', '虾（熟）', '肉类海鲜', 100, '份']],
  [168250, ['Pork, fresh, loin, tenderloin, separable lean only, cooked, roasted', '猪里脊（仅瘦肉，烤熟）', '肉类海鲜', 100, '份']],
  [169967, ['Broccoli, cooked, boiled, drained, without salt', '西兰花（水煮沥干，无盐）', '蔬菜', 100, '份']],
  [170440, ['Potatoes, boiled, cooked without skin, flesh, without salt', '土豆（去皮水煮，无盐）', '主食', 150, '份']],
  [168462, ['Spinach, raw', '菠菜（生）', '蔬菜', 100, '份']],
  [170393, ['Carrots, raw', '胡萝卜（生）', '蔬菜', 100, '份']],
  [170457, ['Tomatoes, red, ripe, raw, year round average', '红番茄（成熟，生，全年平均）', '蔬菜', 150, '个']],
  [168409, ['Cucumber, with peel, raw', '黄瓜（带皮，生）', '蔬菜', 200, '根']],
  [169975, ['Cabbage, raw', '卷心菜（生）', '蔬菜', 100, '份']],
  [169249, ['Lettuce, green leaf, raw', '绿叶生菜（生）', '蔬菜', 100, '份']],
  [169251, ['Mushrooms, white, raw', '白蘑菇（生）', '蔬菜', 100, '份']],
  [170000, ['Onions, raw', '洋葱（生）', '蔬菜', 100, '份']],
  [170108, ['Peppers, sweet, red, raw', '红甜椒（生）', '蔬菜', 100, '份']],
  [171688, ["Apples, raw, with skin (Includes foods for USDA's Food Distribution Program)", '苹果（带皮，生）', '水果', 180, '个']],
  [173944, ['Bananas, raw', '香蕉（生，可食部）', '水果', 100, '根']],
  [169097, ['Oranges, raw, all commercial varieties', '橙子（生，市售各品种，可食部）', '水果', 130, '个']],
  [174683, ['Grapes, red or green (European type, such as Thompson seedless), raw', '葡萄（红或绿，欧洲种，生）', '水果', 100, '份']],
  [167762, ['Strawberries, raw', '草莓（生）', '水果', 100, '份']],
  [167765, ['Watermelon, raw', '西瓜（生，可食部）', '水果', 200, '份']],
  [168153, ['Kiwifruit, green, raw', '绿心猕猴桃（生，可食部）', '水果', 75, '个']],
  [169118, ['Pears, raw', '梨（生）', '水果', 180, '个']],
  [169928, ['Peaches, yellow, raw', '黄肉桃（生）', '水果', 150, '个']],
  [170567, ['Nuts, almonds', '扁桃仁', '油脂坚果', 20, '份']],
  [170187, ['Nuts, walnuts, english', '核桃仁（普通核桃）', '油脂坚果', 20, '份']],
  [173806, ['Peanuts, all types, dry-roasted, without salt', '花生（干烤，无盐）', '油脂坚果', 20, '份']],
  [171413, ['Oil, olive, salad or cooking', '橄榄油（沙拉或烹调用）', '油脂坚果', 10, '份']],
  [171411, ['Oil, soybean, salad or cooking', '大豆油（沙拉或烹调用）', '油脂坚果', 10, '份']],
  [173430, ['Butter, without salt', '黄油（无盐）', '油脂坚果', 10, '份']],
  [169756, ['Rice, white, long-grain, regular, raw, unenriched', '白米（长粒米，生，未强化）', '主食', 50, '份']],
  [173905, ['Cereals, oats, regular and quick, unenriched, cooked with water (includes boiling and microwaving), without salt', '燕麦粥（普通或快熟燕麦，水煮或微波，未强化，无盐）', '主食', 200, '碗']],
]);

// Coarse application categories, not USDA classifications or dish-level analysis.
const categoryMap = {
  'Cereal Grains and Pasta': '主食',
  'Breakfast Cereals': '主食',
  'Dairy and Egg Products': '蛋奶豆',
  'Legumes and Legume Products': '蛋奶豆',
  'Poultry Products': '肉类海鲜',
  'Pork Products': '肉类海鲜',
  'Beef Products': '肉类海鲜',
  'Lamb, Veal, and Game Products': '肉类海鲜',
  'Finfish and Shellfish Products': '肉类海鲜',
  'Sausages and Luncheon Meats': '肉类海鲜',
  'Vegetables and Vegetable Products': '蔬菜',
  'Fruits and Fruit Juices': '水果',
  'Fats and Oils': '油脂坚果',
  'Nut and Seed Products': '油脂坚果',
};

function categoryFor(food) {
  if (/^(Butter,|Butter oil,|Peanuts,|Peanut butter,)/.test(food.description)) return '油脂坚果';
  if (food.foodCategory?.description === 'Baked Products' && /^(Bread,|Rolls,|Bagels,|Tortillas,|English muffins,)/.test(food.description)) return '主食';
  return categoryMap[food.foodCategory?.description] ?? '其他';
}

function nutrient(food, id, expectedUnit) {
  const matches = (food.foodNutrients ?? []).filter(row => row.nutrient?.id === id);
  if (matches.length > 1) throw new Error(`Duplicate nutrient ${id} in ${food.fdcId}`);
  const row = matches[0];
  if (!row || row.amount == null) return null;
  if (row.nutrient.unitName?.toLowerCase() !== expectedUnit) {
    throw new Error(`Unexpected unit for nutrient ${id} in ${food.fdcId}`);
  }
  if (typeof row.amount !== 'number' || !Number.isFinite(row.amount) || row.amount < 0) return null;
  return row.amount; // Preserve actual USDA values, including zero; never derive kcal.
}

const bytes = await readFile(sourcePath);
const source = JSON.parse(bytes.toString('utf8'));
if (!Array.isArray(source.SRLegacyFoods)) throw new Error('Expected { SRLegacyFoods: [...] }');
const seen = new Set();
const foods = [];
const skippedIds = [];
for (const food of source.SRLegacyFoods) {
  if (!Number.isSafeInteger(food.fdcId) || food.fdcId <= 0 || seen.has(food.fdcId)) {
    throw new Error(`Invalid or duplicate fdcId: ${food.fdcId}`);
  }
  seen.add(food.fdcId);
  if (typeof food.description !== 'string' || !food.description.trim()) {
    throw new Error(`Missing description: ${food.fdcId}`);
  }
  const selected = curated.get(food.fdcId);
  if (selected && selected[0] !== food.description) {
    throw new Error(`Curated description mismatch for ${food.fdcId}: ${food.description}`);
  }
  const kcal = nutrient(food, 1008, 'kcal');
  if (kcal === null) {
    skippedIds.push(food.fdcId);
    continue;
  }
  foods.push({
    id: `usda-${food.fdcId}`,
    fdcId: food.fdcId,
    name: selected?.[1] ?? food.description,
    description: food.description,
    category: selected?.[2] ?? categoryFor(food),
    kcal,
    protein: nutrient(food, 1003, 'g'),
    carbs: nutrient(food, 1005, 'g'),
    fat: nutrient(food, 1004, 'g'),
    portion: selected?.[3] ?? 100,
    unit: selected?.[4] ?? '份',
    featured: Boolean(selected),
  });
}
foods.sort((a, b) => a.fdcId - b.fdcId);
for (const id of curated.keys()) {
  if (!foods.some(food => food.fdcId === id)) throw new Error(`Missing usable curated record ${id}`);
}

const ranges = {};
for (const key of ['kcal', 'protein', 'carbs', 'fat']) {
  const values = foods.map(food => food[key]).filter(value => value !== null);
  ranges[key] = {
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    missing: foods.length - values.length,
    zero: values.filter(value => value === 0).length,
  };
}
const metadata = {
  id: 'usda-sr-legacy-april-2018',
  title: 'USDA FoodData Central — SR Legacy',
  publisher: 'U.S. Department of Agriculture, Agricultural Research Service',
  sourceUrl: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip',
  downloadPage: 'https://fdc.nal.usda.gov/download-datasets/',
  dataRelease: 'April 2018',
  retrieved: '2026-11-18',
  sourceFile: 'FoodData_Central_sr_legacy_food_json_2018-04.json',
  sourceSha256: createHash('sha256').update(bytes).digest('hex'),
  license: 'Public domain',
  attribution: 'Nutrient data: USDA FoodData Central, SR Legacy, April 2018. USDA food composition data are in the public domain. Chinese labels and application categories are app curation, not USDA translations or endorsement.',
  nutrientBasis: 'Per 100 g edible food; energy in kcal; protein, carbohydrate and fat in g. Values are extracted from nutrient IDs 1008, 1003, 1005 and 1004, respectively. No calculated substitutes or rounding. Zero is retained; missing or unusable macronutrients are null.',
  inclusionRule: 'Include every record with an actual finite, nonnegative kcal value (nutrient 1008, kcal unit). Missing or unusable kcal records are excluded; unexpected units or duplicate nutrients fail the import.',
  portionNote: 'APP ESTIMATES ONLY, NOT USDA-VERIFIED PORTIONS. Curated default portions are estimated edible gram weights per unit, including 50 g edible weight per hard-boiled egg. All portion gram weights must be editable in the app. Noncurated records default to 100 g per 份. USDA foodPortions are not used. Liquids are weighed in grams, not converted from mL.',
  categoryNote: 'Seven coarse app categories derived from USDA foodCategory, with explicit curated and bread/butter/peanut overrides. Mixed dishes and unmapped categories use 其他. Categories do not change nutrient values.',
  counts: {
    source: source.SRLegacyFoods.length,
    included: foods.length,
    excluded: skippedIds.length,
    featured: curated.size,
  },
  excludedFdcIds: skippedIds.sort((a, b) => a - b),
  ranges,
  curatedMatches: foods.filter(food => food.featured).map(({ fdcId, name, description, portion, unit }) => ({ fdcId, name, description, portion, unit })),
};
await writeFile(resolve(root, 'data/foods.json'), `${JSON.stringify(foods, null, 2)}\n`, 'utf8');
await writeFile(resolve(root, 'data/sources.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ counts: metadata.counts, ranges }, null, 2));
for (const food of foods.filter(food => food.featured)) {
  console.log(`${food.fdcId} | ${food.name} | ${food.description}`);
}
