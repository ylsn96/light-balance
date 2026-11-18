import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { emptyState, localDate, shiftDate, validDate, validateProfile, profileAt, metabolism, nutrition, exerciseCalories, summary, validateState, validateFood, searchFoods } from '../core.js';

const foods = JSON.parse(await readFile(new URL('../data/foods.json', import.meta.url)));
const rice = foods.find(f => f.fdcId === 169757);
const egg = foods.find(f => f.fdcId === 173424);
const profile = { date: '2026-11-01', sex: 'male', age: 30, height: 175, weight: 70, activity: 1.2, goal: 'maintain' };
const meal = (food = rice, grams = 150) => ({ id: 'meal-1', date: '2026-11-18', meal: '午餐', food, grams, quantity: grams, mode: 'grams', portion: food.portion });

test('USDA dataset has unique valid foods and exact familiar nutrients', () => {
  assert.equal(foods.length, 7793);
  assert.equal(foods.filter(f => f.featured).length, 45);
  assert.equal(new Set(foods.map(f => f.id)).size, foods.length);
  assert.ok(foods.every(validateFood));
  assert.equal(rice.kcal, 130);
  assert.equal(egg.kcal, 155);
  assert.equal(egg.portion, 50);
  assert.ok(foods.some(f => f.kcal === 0));
});
test('calories scale by grams and two edible eggs equal 100 grams', () => {
  assert.equal(nutrition(rice, 150).kcal, 195);
  assert.equal(nutrition(egg, 2 * egg.portion).kcal, 155);
  assert.equal(nutrition(rice, 75).kcal, 97.5);
  assert.throws(() => nutrition(rice, -1));
  assert.throws(() => nutrition(rice, 0));
  assert.throws(() => nutrition(rice, 10001));
});
test('unknown macros remain unknown rather than zero', () => {
  const s = emptyState(); s.meals.push(meal({ ...rice, protein: null }));
  assert.equal(nutrition(s.meals[0].food, 100).protein, null);
  assert.equal(summary(s, '2026-11-18').missing.protein, true);
});
test('Mifflin St Jeor uses the correct sex constants and excludes exercise from baseline', () => {
  const m = metabolism(profile);
  assert.equal(m.bmr, 1648.75);
  assert.equal(m.base, 1978.5);
  assert.equal(m.target, 1978.5);
  assert.equal(metabolism({ ...profile, sex: 'female' }).bmr, 1482.75);
  assert.equal(metabolism({ ...profile, goal: 'lose' }).target, 1678.5);
  assert.equal(metabolism({ ...profile, goal: 'gain' }).target, 2178.5);
  assert.equal(metabolism({ ...profile, weight: 45, goal: 'lose' }).offset, 0);
});
test('net exercise subtracts resting MET, no rounding until display', () => {
  assert.ok(Math.abs(exerciseCalories(8.3, 70, 30) - 268.275) < 1e-8);
  assert.equal(exerciseCalories(1, 70, 30), 0);
  assert.throws(() => exerciseCalories(8.3, 70, -1));
});
test('daily energy difference is intake minus total and adds exercise exactly once', () => {
  const s = emptyState(); s.profiles.push(profile); s.meals.push(meal());
  s.exercises.push({ id: 'e1', date: '2026-11-18', name: '慢跑', minutes: 30, weight: 70, kcal: exerciseCalories(8.3, 70, 30), met: 8.3, method: 'met' });
  const d = summary(s, '2026-11-18');
  assert.equal(d.totals.kcal, 195);
  assert.ok(Math.abs(d.expenditure - 2246.775) < 1e-8);
  assert.ok(Math.abs(d.gap + 2051.775) < 1e-8);
  assert.equal(d.remaining, d.target - 195);
  assert.equal(d.complete, false);
  assert.equal(summary(s, '2026-11-17').gap, null);
});
test('empty days and unset profiles do not claim caloric deficits', () => {
  const s = emptyState();
  assert.equal(summary(s, '2026-11-18').gap, null);
  s.meals.push(meal());
  assert.equal(summary(s, '2026-11-18').expenditure, null);
  assert.equal(summary(s, '2026-11-18').gap, null);
});
test('dated body snapshots and weights do not rewrite earlier dates', () => {
  const s = emptyState(); s.profiles.push(profile, { ...profile, date: '2026-11-15', weight: 65, goal: 'lose' });
  s.weights.push({ date: '2026-11-10', value: 68 }, { date: '2026-11-18', value: 64 });
  assert.equal(profileAt(s, '2026-10-01'), null);
  assert.equal(profileAt(s, '2026-11-02').weight, 70);
  assert.equal(profileAt(s, '2026-11-12').weight, 68);
  assert.equal(profileAt(s, '2026-11-16').weight, 65);
  assert.equal(profileAt(s, '2026-11-18').weight, 64);
});
test('dates preserve local day and cross month, year and leap boundaries', () => {
  assert.equal(localDate(new Date(2026, 10, 18, 0, 1)), '2026-11-18');
  assert.equal(shiftDate('2026-01-01', -1), '2025-12-31');
  assert.equal(shiftDate('2024-03-01', -1), '2024-02-29');
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(validDate('2026-13-01'), false);
  assert.equal(validDate('not-a-date'), false);
});
test('backup validation rejects malformed data, unsafe numeric values, duplicated IDs', () => {
  const s = emptyState(); s.profiles.push(profile); s.meals.push(meal());
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(s))), s);
  assert.throws(() => validateState({ version: 9 }));
  assert.throws(() => validateState({ ...s, meals: [meal(), meal()] }));
  assert.throws(() => validateState({ ...s, weights: [{ date: '2026-02-30', value: 70 }] }));
  assert.throws(() => validateState({ ...s, meals: [{ ...meal(), grams: Infinity }] }));
  assert.throws(() => validateState({ ...s, meals: [{ ...meal(), grams: 100, quantity: 900 }] }));
  assert.throws(() => validateState({ ...s, meals: [{ ...meal(), mode: 'portion', grams: 100, quantity: 2, portion: 70 }] }));
  assert.throws(() => validateState({ ...s, customFoods: [{ ...rice, kcal: -1 }] }));
  assert.throws(() => validateState({ ...s, profiles: [{ ...profile, age: 12 }] }));
  assert.equal(validateProfile({ ...profile, weight: NaN }), false);
});
test('Chinese and English food searches include common terms and apply category filters', () => {
  assert.ok(searchFoods(foods, '鸡蛋').some(f => f.id === egg.id));
  assert.ok(searchFoods(foods, '米饭').some(f => f.id === rice.id));
  assert.ok(searchFoods(foods, 'rice cooked').some(f => f.id === rice.id));
  assert.ok(searchFoods(foods, '', '水果').every(f => f.category === '水果'));
  assert.equal(searchFoods(foods, 'no_such_food_91823').length, 0);
});
