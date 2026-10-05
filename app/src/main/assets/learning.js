/* Offline course engine and interface. No requests or downloaded lesson modules. */
(function(root, factory) {
  const engine = factory();
  if (typeof module === 'object' && module.exports) module.exports = engine;
  else root.LearningEngine = engine;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const DAY = 86400000;
  const number = value => Math.max(0, Math.min(100000000, Number(value) || 0));
  const day = ms => new Date(ms).toISOString().slice(0, 10);
  function normalizeProgress(course, input) {
    const source = input || {}, ids = new Set(course.phrases.map(p => p.id));
    const p = {v: 2, known: [...new Set(Array.isArray(source.known) ? source.known : [])].filter(id => ids.has(id)),
      xp: number(source.xp), attempts: number(source.attempts), correct: Math.min(number(source.correct), number(source.attempts)),
      streak: number(source.streak), lastActive: /^\d{4}-\d{2}-\d{2}$/.test(source.lastActive || '') ? source.lastActive : '',
      dailyGoal: Math.min(30, Math.max(5, number(source.dailyGoal) || 10)), cards: {}, units: {}, sessions: {}};
    for (const id of ids) {
      const card = source.cards && source.cards[id];
      if (card && typeof card === 'object') p.cards[id] = {
        reps: Math.min(100, number(card.reps)), interval: Math.min(60, number(card.interval)),
        due: Math.max(0, Number(card.due) || 0), ease: Math.min(3, Math.max(1.3, Number(card.ease) || 2.5)),
        lapses: number(card.lapses), lastReviewed: Math.max(0, Number(card.lastReviewed) || 0)};
    }
    for (const unit of course.units) {
      const value = source.units && source.units[unit.id];
      if (value && Number(value.score) >= 80 && Number(value.completedAt) > 0)
        p.units[unit.id] = {completedAt: Number(value.completedAt), score: Math.min(100, Number(value.score))};
    }
    Object.entries(source.sessions || {}).filter(([key, entry]) => !['__proto__','prototype','constructor'].includes(key) && /^[a-zA-Z0-9_-]{1,100}$/.test(key) && entry && /^\d{4}-\d{2}-\d{2}$/.test(entry.day || ''))
      .sort((a, b) => (Number(b[1].at) || 0) - (Number(a[1].at) || 0)).slice(0, 256)
      .forEach(([key, entry]) => {p.sessions[key] = {day: entry.day, at: Math.max(0, Number(entry.at) || 0), xp: number(entry.xp), attempts: number(entry.attempts), correct: Math.min(number(entry.correct), number(entry.attempts))};});
    return p;
  }
  function touch(p, ms) {
    const today = day(ms);
    if (p.lastActive !== today) {p.streak = p.lastActive === day(ms - DAY) ? p.streak + 1 : 1; p.lastActive = today;}
  }
  function event(p, id, ms, xp, correct) {
    const eventId = /^[a-zA-Z0-9_-]{1,100}$/.test(id || '') ? id : `practice_${ms}`;
    if (p.sessions[eventId]) return false;
    p.sessions[eventId] = {day: day(ms), at: ms, xp, attempts: 1, correct: correct ? 1 : 0};
    p.xp += xp; p.attempts++; if (correct) p.correct++;
    touch(p, ms); return true;
  }
  function review(course, input, id, quality, ms, eventId) {
    const p = normalizeProgress(course, input);
    if (!course.phrases.some(phrase => phrase.id === id)) return p;
    const correct = Number(quality) >= 1;
    if (!event(p, eventId, ms, correct ? 2 : 0, correct)) return p;
    const card = p.cards[id] || {reps: 0, interval: 0, ease: 2.5, lapses: 0};
    let interval;
    if (!correct) {card.reps = 0; card.lapses++; card.ease = Math.max(1.3, card.ease - 0.2); interval = 0;}
    else {
      card.reps++;
      interval = card.reps === 1 ? (quality >= 2 ? 3 : 1) : card.reps === 2 ? 3 : Math.min(60, Math.round(card.interval * card.ease));
      if (quality >= 2) card.ease = Math.min(3, card.ease + 0.1);
      if (!p.known.includes(id)) p.known.push(id);
    }
    p.cards[id] = {...card, interval, lastReviewed: ms, due: ms + (correct ? interval * DAY : 600000)};
    return normalizeProgress(course, p);
  }
  function nextUnit(course, input) {
    const p = normalizeProgress(course, input);
    return course.units.find(unit => !p.units[unit.id]) || null;
  }
  function isUnlocked(course, input, id) {
    const index = course.units.findIndex(unit => unit.id === id), p = normalizeProgress(course, input);
    return index >= 0 && course.units.slice(0, index).every(unit => p.units[unit.id]);
  }
  function completeUnit(course, input, id, answers, ms) {
    const p = normalizeProgress(course, input), unit = course.units.find(unit => unit.id === id);
    if (!unit || !isUnlocked(course, p, id)) return {progress: p, passed: false, score: 0, awarded: false};
    const complete = unit.phrases.every(phrase => Object.prototype.hasOwnProperty.call(answers || {}, phrase.id));
    const score = complete ? Math.round(unit.phrases.filter(phrase => answers[phrase.id] === true).length / unit.phrases.length * 100) : 0;
    if (!complete || score < 80) return {progress: p, passed: false, score, awarded: false};
    const awarded = !p.units[id];
    p.units[id] = {completedAt: p.units[id]?.completedAt || ms, score: Math.max(score, p.units[id]?.score || 0)};
    if (awarded) {p.xp += 30; touch(p, ms);}
    return {progress: p, passed: true, score, awarded};
  }
  function dueCards(course, input, ms, limit = 10) {
    const p = normalizeProgress(course, input);
    return course.phrases.filter(phrase => p.cards[phrase.id] && p.cards[phrase.id].due <= ms)
      .sort((a, b) => p.cards[a.id].due - p.cards[b.id].due || a.id.localeCompare(b.id)).slice(0, limit);
  }
  function dailyPractice(course, input, ms) {
    const p = normalizeProgress(course, input), today = day(ms);
    return Object.values(p.sessions).filter(entry => entry.day === today).reduce((count, entry) => count + entry.attempts, 0);
  }
  function normalizeAnswer(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[?!.,;:"“”'‘’\-–—]/g, '').replace(/\s+/g, ' ').trim();
  }
  function checkTyped(phrase, answer) {
    const input = normalizeAnswer(answer);
    return input.length > 0 && [phrase.n, phrase.r, ...(phrase.alternates || [])].some(value => normalizeAnswer(value) === input);
  }
  function question(course, id, seed = 0) {
    const phrase = course.phrases.find(item => item.id === id);
    if (!phrase) return null;
    const alternatives = course.phrases.filter(item => item.id !== id && item.e !== phrase.e);
    const options = [phrase];
    for (let i = 0; i < alternatives.length && options.length < 4; i++) {
      const candidate = alternatives[(i + Math.abs(Number(seed) || 0)) % alternatives.length];
      if (!options.some(item => item.e === candidate.e)) options.push(candidate);
    }
    const rotate = Math.abs(Number(seed) || 0) % options.length;
    return {phrase, options: options.slice(rotate).concat(options.slice(0, rotate))};
  }
  function mergeProgress(course, local, remote) {
    const a = normalizeProgress(course, local), b = normalizeProgress(course, remote);
    const result = {...a, known: [...new Set([...a.known, ...b.known])], xp: Math.max(a.xp, b.xp), attempts: Math.max(a.attempts, b.attempts), correct: Math.max(a.correct, b.correct), sessions: {...a.sessions, ...b.sessions}};
    if (b.lastActive > a.lastActive) {result.lastActive = b.lastActive; result.streak = b.streak;}
    else if (b.lastActive === a.lastActive) result.streak = Math.max(a.streak, b.streak);
    for (const [id, value] of Object.entries(b.cards)) if (!result.cards[id] || value.lastReviewed > result.cards[id].lastReviewed) result.cards[id] = value;
    for (const [id, value] of Object.entries(b.units)) result.units[id] = result.units[id] ? {completedAt: Math.min(result.units[id].completedAt, value.completedAt), score: Math.max(result.units[id].score, value.score)} : value;
    return normalizeProgress(course, result);
  }
  return {DAY, day, normalizeProgress, review, nextUnit, isUnlocked, completeUnit, dueCards, dailyPractice, normalizeAnswer, checkTyped, question, mergeProgress};
});

if (typeof window !== 'undefined' && typeof document !== 'undefined') (function() {
  'use strict';
  const engine = window.LearningEngine, courses = window.USSPACE_COURSES;
  let session = null, reviewSession = null, revealed = false;
  const challenges = ['Greet each other and ask about your day without looking at the phrase book.', 'Order a drink together using your new food vocabulary.', 'Describe three objects near you using your target language.', 'Send your partner a short voice note with three phrases from your current unit.', 'Plan your next visit using a number, a day and a travel phrase.', 'Read one dialogue aloud together, then swap roles.', 'Say something kind to each other in Kannada and Malayalam.'];
  const html = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[ch]));
  const token = () => `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  function learnProfile() {return Object.prototype.hasOwnProperty.call(courses, state.learn.profile) ? state.learn.profile : 'al';}
  function learnData() {return courses[learnProfile()];}
  function learnProgress() {
    const id = learnProfile();
    state.learn.progress[id] = engine.normalizeProgress(courses[id], state.learn.progress[id]);
    return state.learn.progress[id];
  }
  function commitProgress(progress) {
    state.learn.progress[learnProfile()] = progress;
    window.onLearningProgressChanged?.(learnProfile(), progress);
    save();
  }
  function setLearner(id) {
    if (!Object.prototype.hasOwnProperty.call(courses, id)) return;
    state.learn.profile = id; state.learn.tab = 'today'; state.learn.category = '';
    session = null; reviewSession = null; save(); renderLearn();
  }
  function setLearnTab(tab) {
    state.learn.tab = ['today', 'course', 'alphabet', 'phrases', 'quiz', 'review', 'date', 'progress'].includes(tab) ? tab : 'today';
    if (tab !== 'quiz') session = null;
    if (tab !== 'review') reviewSession = null;
    save(); renderLearn();
  }
  function phraseById(id) {
    for (const course of Object.values(courses)) {
      const phrase = course.phrases.find(item => item.id === id);
      if (phrase) return {p: phrase, x: course};
    }
    return null;
  }
  function speakText(text, lang) {
    if (window.UsSpeech?.speak) {try {window.UsSpeech.speak(text, lang); return;} catch (_) {}}
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return toast('Install a Kannada or Malayalam voice in Android text-to-speech settings');
    const utterance = new SpeechSynthesisUtterance(text); utterance.lang = lang; utterance.rate = .8;
    speechSynthesis.cancel(); speechSynthesis.speak(utterance);
  }
  function speakPhrase(id) {const item = phraseById(id); if (item) speakText(item.p.n, item.x.lang);}
  function speakAlphabet(index) {const item = learnData().alphabet[index]; if (item) speakText(item.n, learnData().lang);}
  function learnCard(phrase) {
    const card = learnProgress().cards[phrase.id];
    return `<div class="langCard ${card?.reps >= 3 ? 'learned' : ''}"><div class="scriptBig">${html(phrase.n)}</div><div class="roman">${html(phrase.r)}</div><div class="meaning">${html(phrase.e)}</div><div class="langActions"><button class="miniBtn" onclick="speakPhrase('${phrase.id}')">🔊 Hear</button><button class="miniBtn" onclick="practicePhrase('${phrase.id}')">Practise recall</button>${card?.reps >= 3 ? '<span class="learnchip">Reviewed 3+ times</span>' : ''}</div></div>`;
  }
  function openLearnUnit(id) {
    if (!learnData().units.some(unit => unit.id === id)) return;
    state.learn.unit = id; state.learn.tab = 'course'; save(); renderLearn();
  }
  function renderLearnToday() {
    const course = learnData(), p = learnProgress(), next = engine.nextUnit(course, p), count = engine.dailyPractice(course, p, Date.now()), due = engine.dueCards(course, p, Date.now(), 10000).length;
    return `<div class="card"><div class="eyebrow">Your daily practice</div><div class="lessonTitle">${html(course.name)}'s ${html(course.language)}</div><p class="sub">A complete beginner path: script, practical vocabulary, grammar, dialogues and recall practice.</p><div class="row between"><b>${count} / ${p.dailyGoal} practice answers today</b><span>${count >= p.dailyGoal ? '✓ Goal met' : 'Keep going'}</span></div><div class="progress"><div class="bar" style="width:${Math.min(100, count / p.dailyGoal * 100)}%"></div></div></div><div class="learnProgressGrid"><button class="learnStat learnAction" onclick="setLearnTab('alphabet')"><div class="small">Start reading</div><b>ಅ · അ</b><div class="small">Script and sound guide</div></button><button class="learnStat learnAction" onclick="setLearnTab('review')"><div class="small">Spaced review</div><b>${due}</b><div class="small">cards due now</div></button></div><div class="card"><div class="eyebrow">${next ? 'Next lesson' : 'Beginner course completed'}</div><div class="lessonTitle" style="margin-top:7px">${html(next?.title || 'Keep the language alive')}</div><p class="sub">${html(next?.objective || 'Revisit the dialogues and review your words. This beginner course is a foundation for conversation, rather than a fluency certificate.')}</p><button class="btn primary full" onclick="${next ? `openLearnUnit('${next.id}')` : `setLearnTab('review')`}">${next ? 'Continue lesson →' : 'Review vocabulary →'}</button></div><div class="offlineNote">All lessons and exercises are packaged on your phone. Audio uses Android text-to-speech; install the language voice for offline pronunciation.</div>`;
  }
  function renderUnitList() {
    const course = learnData(), p = learnProgress();
    return `<div class="card"><div class="lessonTitle">${html(course.language)} beginner course</div><p class="sub">${course.units.length} ordered units · ${course.phrases.length} words and phrases. Browse any lesson; pass each checkpoint with at least 80% to unlock the next checkpoint.</p></div>${course.units.map((unit, index) => `<button class="courseUnit" onclick="openLearnUnit('${unit.id}')"><span class="unitNumber">${p.units[unit.id] ? '✓' : index + 1}</span><span><b>${html(unit.title)}</b><span class="small">${html(unit.objective)}</span></span><span class="small">${p.units[unit.id] ? `${p.units[unit.id].score}%` : engine.isUnlocked(course, p, unit.id) ? 'Start →' : 'Browse'}</span></button>`).join('')}`;
  }
  function renderLearnCourse() {
    const course = learnData(), unit = course.units.find(item => item.id === state.learn.unit);
    if (!unit) return renderUnitList();
    const unlocked = engine.isUnlocked(course, learnProgress(), unit.id);
    const grammar = unit.grammar || {};
    return `<button class="backpill" onclick="showCourseList()">← All units</button><div class="card"><div class="eyebrow">Unit ${course.units.indexOf(unit) + 1} of ${course.units.length}</div><div class="lessonTitle">${html(unit.title)}</div><p class="sub">${html(unit.objective)}</p></div><div class="card grammarCard"><div class="eyebrow">Grammar in use</div><h3>${html(grammar.title)}</h3><p>${html(grammar.explanation)}</p>${(grammar.examples || []).map(item => `<div class="grammarExample"><b>${html(item.n)}</b><span class="roman">${html(item.r)}</span><span>${html(item.e)}</span></div>`).join('')}</div><div class="section-title">Words and phrases</div>${unit.phrases.map(learnCard).join('')}<div class="card"><div class="eyebrow">Use it in a conversation</div><p class="sub">Read both roles out loud, then try the conversation with your partner.</p>${(unit.dialogue || []).map(item => `<div class="dialogueTurn"><span class="tag">${html(item.speaker)}</span><b>${html(item.n)}</b><span class="roman">${html(item.r)}</span><span>${html(item.e)}</span></div>`).join('')}</div><div class="card"><b>Lesson checkpoint</b><p class="sub">Answer all ${unit.phrases.length} questions. You need 80% to complete this unit. The first pass earns 30 XP.</p><button class="btn primary full" ${unlocked ? '' : 'disabled'} onclick="startCheckpoint('${unit.id}')">${unlocked ? 'Start checkpoint →' : 'Complete earlier checkpoints first'}</button></div>`;
  }
  function showCourseList() {state.learn.unit = ''; renderLearn();}
  function renderLearnAlphabet() {
    const course = learnData(), groups = [...new Set(course.alphabet.map(item => item.group))];
    return `<div class="card"><div class="lessonTitle">Read ${html(course.nativeName)}</div><p class="sub">Romanization is a pronunciation aid. ā, ī and ū are held longer than a, i and u. ṭ, ḍ, ṇ and ḷ use a curled-back tongue; doubled consonants are held longer. Listen and repeat.</p><p class="sub">${html(course.readingGuide || 'Consonants have an inherent short a sound. A vowel sign changes that sound; a virama removes it. Practise slowly before reading full words.')}</p></div>${groups.map(group => `<div class="section-title">${html(group)}</div><div class="alphabetGrid">${course.alphabet.map((item, index) => item.group === group ? `<button class="letterCard" onclick="speakAlphabet(${index})"><b>${html(item.n)}</b><span>${html(item.r)}</span><span class="small">${html(item.e)}</span></button>` : '').join('')}</div>`).join('')}<div class="card"><b>Reading practice</b><p class="sub">Find a letter you recognise in the words below, then hear the whole word.</p>${course.phrases.slice(0, 3).map(learnCard).join('')}</div>`;
  }
  function setLearnCategory(id) {state.learn.category = id; save(); renderLearn();}
  function renderLearnPhrases() {
    const course = learnData(), unit = course.units.find(item => item.id === state.learn.category) || course.units[0];
    return `<div class="card"><div class="lessonTitle">Everyday phrase book</div><p class="sub">${course.phrases.length} offline words and phrases. Informal examples suit your partner; grammar notes also explain polite forms.</p><div class="topicRow">${course.units.map(item => `<button class="topicBtn ${unit.id === item.id ? 'active' : ''}" onclick="setLearnCategory('${item.id}')">${html(item.title)}</button>`).join('')}</div></div>${unit.phrases.map(learnCard).join('')}`;
  }
  function startCheckpoint(id) {
    const course = learnData(), unit = course.units.find(item => item.id === id);
    if (!unit || !engine.isUnlocked(course, learnProgress(), id)) return;
    session = {id: token(), unit: id, mode: 'meaning', ids: unit.phrases.map(phrase => phrase.id), index: 0, answers: {}, answered: false};
    state.learn.tab = 'quiz'; renderLearn();
  }
  function startPractice(mode = 'meaning') {
    const course = learnData(), p = learnProgress(), next = engine.nextUnit(course, p);
    const pool = course.units.filter(unit => p.units[unit.id] || unit.id === next?.id).flatMap(unit => unit.phrases);
    const offset = p.attempts % Math.max(1, pool.length), ordered = pool.slice(offset).concat(pool.slice(0, offset));
    session = {id: token(), unit: '', mode, ids: ordered.slice(0, 10).map(phrase => phrase.id), index: 0, answers: {}, answered: false};
    state.learn.tab = 'quiz'; renderLearn();
  }
  function practicePhrase(id) {
    if (!learnData().phrases.some(phrase => phrase.id === id)) return;
    session = {id: token(), unit: '', mode: 'type', ids: [id], index: 0, answers: {}, answered: false};
    state.learn.tab = 'quiz'; renderLearn();
  }
  function answerPractice(id) {
    if (!session || session.answered || session.index >= session.ids.length) return;
    const course = learnData(), phraseId = session.ids[session.index], phrase = course.phrases.find(item => item.id === phraseId);
    const correct = session.mode === 'type' ? engine.checkTyped(phrase, document.getElementById('typedLearnAnswer')?.value) : id === phraseId;
    session.answered = true; session.answers[phraseId] = correct;
    commitProgress(engine.review(course, learnProgress(), phraseId, correct ? 1 : 0, Date.now(), `q_${session.id}_${session.index}`));
    renderLearn();
  }
  function nextLearnQuestion() {
    if (!session?.answered) return;
    session.index++; session.answered = false;
    if (session.index === session.ids.length && session.unit) {
      session.result = engine.completeUnit(learnData(), learnProgress(), session.unit, session.answers, Date.now());
      commitProgress(session.result.progress);
    }
    renderLearn();
  }
  function renderLearnQuiz() {
    if (!session) return `<div class="card"><div class="lessonTitle">Recall practice</div><p class="sub">Choose how to practise. Ten questions use your current and completed lessons.</p><div class="practiceModes"><button class="btn primary full" onclick="startPractice('meaning')">Meaning quiz</button><button class="btn full" onclick="startPractice('type')">Type the phrase</button><button class="btn full" onclick="startPractice('listen')">Listen and understand</button></div><p class="small">Typed answers accept native script or romanization, including plain letters without accent marks. Listening needs an installed Android voice.</p></div>`;
    if (session.index >= session.ids.length) {
      const correct = Object.values(session.answers).filter(Boolean).length, score = Math.round(correct / session.ids.length * 100);
      return `<div class="card"><div class="eyebrow">${session.unit ? 'Checkpoint result' : 'Practice finished'}</div><div class="lessonTitle">${score}% · ${correct}/${session.ids.length} correct</div><p class="sub">${session.unit ? session.result?.passed ? '✓ Unit completed! '+(session.result.awarded ? '30 bonus XP earned.' : 'Your best result is saved.') : 'Keep practising, then try the checkpoint again. You need at least 80%.' : 'Your review schedule and progress have been updated.'}</p><button class="btn primary full" onclick="${session.unit ? `startCheckpoint('${session.unit}')` : `startPractice('${session.mode}')`}">${session.unit ? 'Try checkpoint again' : 'Another practice'}</button><button class="btn full" style="margin-top:10px" onclick="setLearnTab('course')">Return to course →</button></div>`;
    }
    const id = session.ids[session.index], question = engine.question(learnData(), id, session.index + learnProgress().attempts), phrase = question.phrase;
    const prompt = session.mode === 'type' ? `<p class="quote">${html(phrase.e)}</p><div class="small">Type it in ${html(learnData().language)} or romanization.</div>` : session.mode === 'listen' ? `<p>Listen, then choose the meaning.</p><button class="btn soft full" onclick="speakPhrase('${id}')">🔊 Play phrase</button>` : `<div class="scriptBig">${html(phrase.n)}</div><div class="roman">${html(phrase.r)}</div><div class="small">Choose the meaning.</div>`;
    return `<div class="card"><div class="row between"><span class="eyebrow">${session.unit ? 'Unit checkpoint' : 'Practice'}</span><span class="small">${session.index + 1}/${session.ids.length}</span></div>${prompt}</div><div class="card">${session.mode === 'type' ? `<input id="typedLearnAnswer" class="field" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Your answer" ${session.answered ? 'disabled' : ''} onkeydown="if(event.key==='Enter')answerPractice('')"><button class="btn primary full" ${session.answered ? 'disabled' : ''} onclick="answerPractice('')">Check answer</button>` : question.options.map(option => `<button class="quizOption ${session.answered && option.id === id ? 'correct' : ''}" ${session.answered ? 'disabled' : ''} onclick="answerPractice('${option.id}')">${html(option.e)}</button>`).join('')}${session.answered ? `<div class="answerFeedback ${session.answers[id] ? 'good' : 'again'}"><b>${session.answers[id] ? '✓ Correct · +2 XP' : 'Try this phrase again later'}</b><div class="scriptBig">${html(phrase.n)}</div><div class="roman">${html(phrase.r)}</div><p>${html(phrase.e)}</p><button class="miniBtn" onclick="speakPhrase('${id}')">🔊 Hear answer</button></div><button class="btn primary full" style="margin-top:12px" onclick="nextLearnQuestion()">${session.index + 1 === session.ids.length ? 'See result' : 'Next question'} →</button>` : ''}</div>`;
  }
  function startReview() {
    reviewSession = {id: token(), ids: engine.dueCards(learnData(), learnProgress(), Date.now(), 20).map(phrase => phrase.id), index: 0};
    revealed = false; state.learn.tab = 'review'; renderLearn();
  }
  function revealReview() {revealed = true; renderLearn();}
  function gradeReview(quality) {
    if (!reviewSession || !revealed || reviewSession.index >= reviewSession.ids.length) return;
    const index = reviewSession.index, id = reviewSession.ids[index];
    commitProgress(engine.review(learnData(), learnProgress(), id, quality, Date.now(), `r_${reviewSession.id}_${index}`));
    reviewSession.index++; revealed = false; renderLearn();
  }
  function renderLearnReview() {
    const due = engine.dueCards(learnData(), learnProgress(), Date.now(), 10000).length;
    if (!reviewSession || !reviewSession.ids.length) return `<div class="card"><div class="lessonTitle">Spaced repetition</div><p class="sub">${due ? `${due} phrases are due. Try to recall each English meaning before revealing the answer.` : 'No reviews are due right now. Practise a lesson to add words to your review schedule.'}</p><button class="btn primary full" onclick="${due ? 'startReview()' : `setLearnTab('course')`}">${due ? 'Start review →' : 'Open course →'}</button><p class="small">Correct recalls return in 1, 3, then increasing numbers of days. A difficult card returns in ten minutes.</p></div>`;
    if (reviewSession.index >= reviewSession.ids.length) return `<div class="card"><div class="lessonTitle">Review complete ✓</div><p class="sub">${reviewSession.ids.length} cards reviewed. Your next review dates are saved.</p><button class="btn primary full" onclick="setLearnTab('today')">Back to today →</button></div>`;
    const phrase = phraseById(reviewSession.ids[reviewSession.index]).p;
    return `<div class="card"><div class="eyebrow">Review ${reviewSession.index + 1}/${reviewSession.ids.length}</div><div class="scriptBig">${html(phrase.n)}</div><div class="roman">${html(phrase.r)}</div><p class="sub">Say the English meaning before revealing it.</p><button class="miniBtn" onclick="speakPhrase('${phrase.id}')">🔊 Hear</button>${revealed ? `<div class="answerFeedback"><b>${html(phrase.e)}</b></div><div class="reviewGrades"><button class="btn" onclick="gradeReview(0)">Again</button><button class="btn primary" onclick="gradeReview(1)">Got it</button><button class="btn soft" onclick="gradeReview(2)">Easy</button></div>` : '<button class="btn primary full" style="margin-top:14px" onclick="revealReview()">Reveal meaning</button>'}</div>`;
  }
  function rerollLanguageDate() {state.learn.dateSeed = (state.learn.dateSeed || 0) + 1; save(); renderLearn();}
  function addPhrasePostcard(id) {
    const phrase = phraseById(id)?.p; if (!phrase) return;
    state.notes.unshift({id: Date.now(), text: `${phrase.n} · ${phrase.r}\n${phrase.e} ♥`, date: new Date().toISOString()});
    save(); toast('Phrase postcard added to Love Notes 💌');
  }
  function renderLearnDate() {
    const course = learnData(), seed = Math.floor(Date.now() / engine.DAY) + (state.learn.dateSeed || 0), phrase = course.phrases.filter(item => /affection|love|together/i.test(item.t))[0] || course.phrases[0];
    return `<div class="dateChallenge"><div class="bigEmoji">♥</div><div class="eyebrow">Together challenge</div><div class="lessonTitle" style="margin-top:9px">${html(challenges[seed % challenges.length])}</div><button class="btn soft" style="margin-top:14px" onclick="rerollLanguageDate()">Another challenge</button></div><div class="postcard"><div class="eyebrow">A little phrase postcard</div><div class="scriptBig">${html(phrase.n)}</div><div class="roman">${html(phrase.r)}</div><p>${html(phrase.e)}</p><div class="langActions"><button class="miniBtn" onclick="speakPhrase('${phrase.id}')">🔊 Hear</button><button class="miniBtn" onclick="addPhrasePostcard('${phrase.id}')">💌 Add to Love Notes</button></div></div><div class="card"><b>Your partner's learning</b><p class="sub">When paired, lesson completion, review progress and practice points sync with your partner. Health and Cycle stay private.</p>${Object.entries(courses).map(([id, item]) => {const p = engine.normalizeProgress(item, state.learn.progress[id]);return `<div class="partnerLearning"><b>${html(item.name)} · ${html(item.language)}</b><span>${Object.keys(p.units).length}/${item.units.length} units · ${p.xp} XP · ${p.streak} day streak</span></div>`;}).join('')}</div>`;
  }
  function setDailyLearningGoal(value) {const p = learnProgress();p.dailyGoal = Math.min(30, Math.max(5, Number(value) || 10));commitProgress(p);renderLearn();}
  function renderLearnProgress() {
    const course = learnData(), p = learnProgress(), completed = Object.keys(p.units).length, mastered = Object.values(p.cards).filter(card => card.reps >= 3).length, accuracy = p.attempts ? Math.round(p.correct / p.attempts * 100) : 0;
    return `<div class="card"><div class="row between"><div><div class="eyebrow">${html(course.language)}</div><div class="lessonTitle">${html(course.name)}'s progress</div><p class="sub">Beginner course completion</p></div><div class="progressRing" style="--pct:${Math.round(completed / course.units.length * 100)}%"><b>${Math.round(completed / course.units.length * 100)}%</b></div></div></div><div class="learnProgressGrid"><div class="learnStat"><div class="small">Units completed</div><b>${completed}/${course.units.length}</b><div class="small">checkpoint score ≥80%</div></div><div class="learnStat"><div class="small">Practice points</div><b>${p.xp} XP</b><div class="small">${p.streak} day streak</div></div><div class="learnStat"><div class="small">Words encountered</div><b>${p.known.length}/${course.phrases.length}</b><div class="small">${mastered} recalled 3+ times</div></div><div class="learnStat"><div class="small">Practice accuracy</div><b>${p.attempts ? accuracy+'%' : '—'}</b><div class="small">${p.correct}/${p.attempts} correct</div></div></div><div class="card"><label class="label" for="learningDailyGoal">Daily practice goal</label><select id="learningDailyGoal" class="field" onchange="setDailyLearningGoal(this.value)">${[5,10,15,20,30].map(value => `<option value="${value}" ${value === p.dailyGoal ? 'selected' : ''}>${value} answers a day</option>`).join('')}</select><div class="small">${engine.dailyPractice(course, p, Date.now())} answers today. Your earlier v0.12 phrase marks and XP are kept.</div></div><div class="card"><b>Completed checkpoints</b>${completed ? course.units.filter(unit => p.units[unit.id]).map(unit => `<div class="partnerLearning"><span>${html(unit.title)}</span><b>${p.units[unit.id].score}% ✓</b></div>`).join('') : '<p class="sub">Start the first lesson to earn your first checkpoint.</p>'}</div><button class="btn primary full" onclick="setLearnTab('course')">Continue your course →</button>`;
  }
  function renderLearn() {
    const panel = document.getElementById('learnPanel'); if (!panel) return;
    learnProgress(); const profile = learnProfile();
    document.getElementById('learnerAl')?.classList.toggle('active', profile === 'al');
    document.getElementById('learnerYashika')?.classList.toggle('active', profile === 'yashika');
    document.querySelectorAll('.learnTab').forEach(button => button.classList.toggle('active', button.dataset.ltab === state.learn.tab));
    const renders = {today: renderLearnToday, course: renderLearnCourse, alphabet: renderLearnAlphabet, phrases: renderLearnPhrases, quiz: renderLearnQuiz, review: renderLearnReview, date: renderLearnDate, progress: renderLearnProgress};
    panel.innerHTML = (renders[state.learn.tab] || renderLearnToday)();
  }
  Object.assign(window, {learnProfile, learnData, learnProgress, setLearner, setLearnTab, setLearnCategory, phraseById, speakPhrase, speakAlphabet, renderLearn, openLearnUnit, showCourseList, startCheckpoint, startPractice, practicePhrase, answerPractice, nextLearnQuestion, startReview, revealReview, gradeReview, rerollLanguageDate, addPhrasePostcard, setDailyLearningGoal});
})();
