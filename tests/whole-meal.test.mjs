import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseMealText, mealFoodCandidates } from '../core.js';

const foods = JSON.parse(await readFile(new URL('../data/foods.json', import.meta.url), 'utf8'));

test('whole meal preserves brand context and does not invent McDonald’s nutrition', () => {
  const result = parseMealText('晚餐吃麦当劳双层板烧鸡腿堡+中薯条+无糖可口可乐');
  assert.equal(result.meal, '晚餐');
  assert.deepEqual(result.items.map(item => [item.name, item.brand, item.size, item.quantity]), [
    ['双层板烧鸡腿堡', '麦当劳', '', 1],
    ['薯条', '麦当劳', '中份', 1],
    ['无糖可口可乐', '麦当劳', '', 1],
  ]);
  assert.ok(result.items.every(item => mealFoodCandidates(foods, item).length === 0));
});

test('whole meal parses Chinese counts, grams, kilograms, decimals and separators', () => {
  const result = parseMealText('今天午餐吃白米饭150克、两只水煮鸡蛋和香蕉1根，牛奶250g；半碗燕麦粥\n鸡胸肉0.2kg＋苹果×2');
  assert.equal(result.meal, '午餐');
  assert.deepEqual(result.items.map(item => [item.name, item.quantity, item.mode]), [
    ['白米饭', 150, 'grams'], ['水煮鸡蛋', 2, 'portion'], ['香蕉', 1, 'portion'],
    ['牛奶', 250, 'grams'], ['燕麦粥', .5, 'portion'], ['鸡胸肉', 200, 'grams'], ['苹果', 2, 'portion'],
  ]);
  assert.equal(parseMealText('一百二十五克米饭').items[0].quantity, 125);
  assert.equal(parseMealText('牛肉半斤').items[0].quantity, 250);
  assert.equal(parseMealText('香蕉１．５根').items[0].quantity, 1.5);
  assert.equal(parseMealText('鸡蛋', '加餐').meal, '加餐');
});

test('volume remains unresolved rather than becoming grams', () => {
  for (const text of ['牛奶250ml', '可乐330毫升', '半升水', '水0.5L']) {
    const item = parseMealText(text).items[0];
    assert.equal(item.volume, true);
    assert.equal(item.quantity, null);
    assert.equal(item.mode, 'grams');
    assert.equal(item.raw, text);
  }
});

test('names, sugar-free labels, sizes and parenthetical descriptions are retained', () => {
  const items = parseMealText('三文鱼100克+双层汉堡+无糖可口可乐+和田红枣+和牛+薯条（中份）+鸡蛋（全蛋，熟）').items;
  assert.deepEqual(items.map(item => item.name), ['三文鱼', '双层汉堡', '无糖可口可乐', '和田红枣', '和牛', '薯条', '鸡蛋（全蛋，熟）']);
  assert.equal(items[5].size, '中份');
  assert.equal(items[1].quantity, 1);
  assert.equal(items[1].explicitQuantity, false);
  const brands = parseMealText('麦当劳汉堡+肯德基薯条+可乐').items;
  assert.deepEqual(brands.map(item => item.brand), ['麦当劳', '肯德基', '肯德基']);
});

test('whole meal rejects empty, oversized and nameless input without truncating', () => {
  for (const source of ['', '  ', '晚餐吃+++', '两只', 'a'.repeat(2001), Array(31).fill('苹果').join('+')]) {
    assert.throws(() => parseMealText(source));
  }
  assert.equal(parseMealText('苹果++香蕉，').items.length, 2);
  assert.equal(parseMealText('米饭0克').items[0].quantity, 0);
  assert.equal(parseMealText('米饭20kg').items[0].quantity, 20000);
});
