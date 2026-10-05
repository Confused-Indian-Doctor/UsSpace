/* Exercise the engine shipped in the APK, including actual packaged courses. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assets = path.join(__dirname, '../app/src/main/assets');
const engine = require(path.join(assets, 'learning.js'));
const courses = require(path.join(assets, 'learning-content.js'));
const date = Date.parse('2026-10-05T12:00:00Z');
let checks = 0;
function test(name, run) {run(); checks++; process.stdout.write(`✓ ${name}\n`);}
for (const [profile, course] of Object.entries(courses)) {
  test(`${course.language}: complete content is packaged with unique identifiers`, () => {
    assert.ok(course.units.length >= 14);
    assert.ok(course.phrases.length >= 120);
    assert.ok(course.alphabet.length >= 45);
    assert.equal(new Set(course.phrases.map(p => p.id)).size, course.phrases.length);
    for (const unit of course.units) {
      assert.ok(unit.phrases.length >= 6, unit.id);
      assert.ok(unit.grammar.explanation.length > 20, unit.id);
      assert.ok(unit.grammar.examples.length >= 1, unit.id);
      assert.ok(unit.dialogue.length >= 2, unit.id);
      for (const phrase of unit.phrases) for (const key of ['id','n','r','e']) assert.ok(phrase[key], `${unit.id}:${key}`);
    }
    const prefix = profile === 'al' ? 'kn' : 'ml';
    for (let i = 1; i <= 32; i++) assert.ok(course.phrases.some(p => p.id === `${prefix}${String(i).padStart(2, '0')}`));
  });
  test(`${course.language}: old phrase progress survives migration`, () => {
    const id = profile === 'al' ? 'kn19' : 'ml19';
    const old = {known:[id,id,'invalid'],xp:100,attempts:12,correct:9,streak:4,lastActive:'2026-10-04'};
    const p = engine.normalizeProgress(course, old);
    assert.deepEqual(p.known, [id]); assert.equal(p.xp,100);assert.equal(p.attempts,12);assert.equal(p.correct,9);assert.equal(p.streak,4);
    assert.equal(old.known.length, 3, 'normalization must not mutate source state');
  });
  test(`${course.language}: ordered checkpoint requires complete answers and 80%`, () => {
    const unit = course.units[0], next = course.units[1];
    const all = Object.fromEntries(unit.phrases.map(p => [p.id,true]));
    const missing = {...all};delete missing[unit.phrases[0].id];
    assert.equal(engine.completeUnit(course,{},unit.id,missing,date).passed,false);
    const bad = Object.fromEntries(unit.phrases.map((p,i) => [p.id,i < Math.floor(unit.phrases.length / 2)]));
    assert.equal(engine.completeUnit(course,{},unit.id,bad,date).passed,false);
    assert.equal(engine.completeUnit(course,{},next.id,Object.fromEntries(next.phrases.map(p => [p.id,true])),date).passed,false);
    const passed = engine.completeUnit(course,{},unit.id,all,date);
    assert.equal(passed.passed,true);assert.equal(passed.score,100);assert.equal(passed.progress.xp,30);
    assert.equal(engine.nextUnit(course,passed.progress).id,next.id);
    assert.equal(engine.isUnlocked(course,passed.progress,next.id),true);
    const repeat = engine.completeUnit(course,passed.progress,unit.id,all,date+1000);
    assert.equal(repeat.awarded,false);assert.equal(repeat.progress.xp,30);
  });
  test(`${course.language}: spaced review retries difficult cards and expands recall intervals`, () => {
    const id = course.phrases[0].id;
    let p = engine.review(course,{},id,1,date,'answer_a');
    assert.equal(p.cards[id].interval,1);assert.equal(p.cards[id].due,date+engine.DAY);
    assert.equal(engine.dueCards(course,p,date).length,0);
    assert.equal(engine.dueCards(course,p,date+engine.DAY)[0].id,id);
    const duplicate = engine.review(course,p,id,1,date+10,'answer_a');
    assert.deepEqual(duplicate,p,'the same answer event cannot award XP twice');
    p = engine.review(course,p,id,1,date+engine.DAY,'answer_b');assert.equal(p.cards[id].interval,3);assert.equal(p.streak,2);
    p = engine.review(course,p,id,1,date+4*engine.DAY,'answer_c');assert.equal(p.cards[id].interval,8);assert.equal(p.streak,1);
    p = engine.review(course,p,id,0,date+12*engine.DAY,'answer_d');
    assert.equal(p.cards[id].interval,0);assert.equal(p.cards[id].lapses,1);assert.equal(p.cards[id].due,date+12*engine.DAY+600000);
    assert.equal(p.correct,3);assert.equal(p.attempts,4);assert.equal(p.xp,6);
    assert.equal(engine.dailyPractice(course,p,date+12*engine.DAY),1);
  });
  test(`${course.language}: typed answers accept script and accent-free romanization`, () => {
    for (const phrase of course.phrases) {
      assert.equal(engine.checkTyped(phrase,phrase.n),true,phrase.id);
      assert.equal(engine.checkTyped(phrase,engine.normalizeAnswer(phrase.r)),true,phrase.id);
    }
    assert.equal(engine.checkTyped(course.phrases[0],''),false);
    assert.equal(engine.checkTyped(course.phrases[0],'definitely wrong'),false);
  });
  test(`${course.language}: concurrent progress preserves both sets of accomplishments`, () => {
    const a = engine.review(course,{},course.phrases[0].id,1,date,'phone_a');
    const b = engine.review(course,{},course.phrases[1].id,1,date+1000,'phone_b');
    const merged = engine.mergeProgress(course,a,b);
    assert.ok(merged.cards[course.phrases[0].id]);assert.ok(merged.cards[course.phrases[1].id]);
    assert.equal(merged.known.length,2);assert.equal(Object.keys(merged.sessions).length,2);
    assert.deepEqual(engine.mergeProgress(course,merged,b),merged,'replayed snapshots must be idempotent');
  });
  test(`${course.language}: answer choices have exactly one correct English meaning`, () => {
    for (const phrase of course.phrases) {
      const q = engine.question(course,phrase.id,17);
      assert.equal(q.options.length,4);
      assert.equal(q.options.filter(p => p.e === phrase.e).length,1);
      assert.equal(new Set(q.options.map(p => p.e)).size,4);
    }
  });
}
test('Browser interface uses the same engine and completes a real first lesson', () => {
  const elements = new Map();
  const element = id => {if (!elements.has(id)) elements.set(id,{innerHTML:'',value:'',classList:{toggle(){}}});return elements.get(id);};
  const context = {console,Date,Math,setTimeout,clearTimeout,document:{getElementById:element,querySelectorAll:()=>[]},state:{learn:{profile:'al',tab:'today',progress:{al:{},yashika:{}}},notes:[]},save(){},toast(){}};
  context.window = context;context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(assets,'learning-content.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(assets,'learning.js'),'utf8'),context);
  context.renderLearn();assert.match(element('learnPanel').innerHTML,/Continue lesson/);
  const unit = context.USSPACE_COURSES.al.units[0];
  context.startCheckpoint(unit.id);
  for (const phrase of unit.phrases) {
    context.answerPractice(phrase.id);assert.match(element('learnPanel').innerHTML,/Correct/);
    context.nextLearnQuestion();
  }
  assert.match(element('learnPanel').innerHTML,/Unit completed/);
  assert.ok(context.state.learn.progress.al.units[unit.id]);
  const originalXp = context.state.learn.progress.al.xp;
  context.nextLearnQuestion();assert.equal(context.state.learn.progress.al.xp,originalXp);
  context.setLearner('yashika');assert.match(element('learnPanel').innerHTML,/Malayalam/);
  context.startPractice('listen');
  const screen = element('learnPanel').innerHTML;
  assert.match(screen,/Play phrase/);assert.doesNotMatch(screen,/scriptBig/,'listening question must conceal native text until answered');
  context.setLearnTab('alphabet');assert.match(element('learnPanel').innerHTML,/Read മലയാളം/);
});
process.stdout.write(`${checks} learning checks passed.\n`);
