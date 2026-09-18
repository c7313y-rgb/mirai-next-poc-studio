import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendThemes } from '../server/lib/recommendations.js';

test('関心候補は本人のタグとテーマ内容の一致理由を示す',()=>{
  const themes=[{id:1,title:'ロボット工場',summary:'機械設計'},{id:2,title:'地域の野菜',summary:'農業と食'}];
  const data=recommendThemes(themes,[{tags:JSON.stringify(['食・農業'])},{tags:['食・農業','食・農業','不明タグ']}]);
  assert.equal(data.themes[0].id,2);
  assert.deepEqual(data.themes[0].matchTags,[{tag:'食・農業',count:2}]);
  assert.equal(data.basisRecordCount,2);
  assert.equal(data.themes.length,2);
  assert.equal(themes[0].id,1);
});
test('タグのない記録や該当がない場合も配信テーマを隠さず元の順序を保つ',()=>{
  const themes=[{id:8,title:'文章表現',summary:'言葉'},{id:3,title:'地域の野菜',summary:'農業'}];
  const data=recommendThemes(themes,[{tags:'invalid'},{tags:['不明タグ']}]);
  assert.deepEqual(data.themes.map(t=>t.id),[8,3]);
  assert.ok(data.themes.every(t=>t.matchScore===0));
  assert.deepEqual(recommendThemes([],[]).themes,[]);
});
test('旧データの有効なJSONでも配列でないタグは無視し、推薦一覧を停止させない',()=>{
  const themes=[{id:1,title:'AIとデータ',summary:'情報を調べる'}];
  const data=recommendThemes(themes,['null','{}','"情報・デジタル"','42','true'].map(tags=>({tags})).concat([{tags:'["情報・デジタル",null,{}]'}]));
  assert.equal(data.themes.length,1);
  assert.deepEqual(data.themes[0].matchTags,[{tag:'情報・デジタル',count:1}]);
});
