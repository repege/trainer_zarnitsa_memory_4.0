// Зарница 2.0 — бесконечный тренажёр запоминания для GitHub Pages
// Важно: сайт без сервера. Вопросы, картинки, пароль и статистика сохраняются в localStorage конкретного браузера.

const KEYS = {
  questions: 'zarnitsa_questions_v3',
  sessions: 'zarnitsa_sessions_v3',
  password: 'zarnitsa_admin_password_v3',
  active: 'zarnitsa_active_session_v3'
};

const DEFAULT_ADMIN_PASSWORD = '1234';

let questions = loadQuestions();
let adminLoggedIn = false;
let activeSession = loadActiveSession();
let currentQuestion = null;
let answeredCurrent = false;

const $ = (id) => document.getElementById(id);

window.addEventListener('DOMContentLoaded', () => {
  bindNavigation();
  bindStudent();
  bindAdmin();
  fillBlockFilter();
  restoreStudentUi();
});

function loadQuestions() {
  const saved = localStorage.getItem(KEYS.questions);
  if (saved) {
    try { return JSON.parse(saved); } catch (e) { console.warn(e); }
  }
  return structuredClone(DEFAULT_QUESTIONS);
}

function saveQuestions() {
  localStorage.setItem(KEYS.questions, JSON.stringify(questions));
}

function loadSessions() {
  const saved = localStorage.getItem(KEYS.sessions);
  if (!saved) return [];
  try { return JSON.parse(saved); } catch (e) { return []; }
}

function saveSessions(sessions) {
  localStorage.setItem(KEYS.sessions, JSON.stringify(sessions));
}

function loadActiveSession() {
  const saved = localStorage.getItem(KEYS.active);
  if (!saved) return null;
  try { return JSON.parse(saved); } catch (e) { return null; }
}

function saveActiveSession() {
  if (activeSession) localStorage.setItem(KEYS.active, JSON.stringify(activeSession));
}

function getAdminPassword() {
  return localStorage.getItem(KEYS.password) || DEFAULT_ADMIN_PASSWORD;
}

function bindNavigation() {
  $('studentModeBtn').addEventListener('click', () => showPanel('student'));
  $('adminModeBtn').addEventListener('click', () => showPanel('admin'));
  $('statsTopBtn').addEventListener('click', showStatsModal);
}

function showPanel(mode) {
  const student = mode === 'student';
  $('studentPanel').classList.toggle('hidden', !student);
  $('adminPanel').classList.toggle('hidden', student);
  $('studentModeBtn').classList.toggle('active', student);
  $('adminModeBtn').classList.toggle('active', !student);
  if (!student && adminLoggedIn) {
    renderAdminList();
    renderAdminStats();
  }
}

function bindStudent() {
  $('startQuizBtn').addEventListener('click', startNewSession);
  $('continueQuizBtn').addEventListener('click', continueSession);
  $('statsBtn').addEventListener('click', showStatsModal);
  $('finishBtn').addEventListener('click', finishSession);
  $('closeStatsBtn').addEventListener('click', () => $('statsModal').classList.add('hidden'));
  $('statsModal').addEventListener('click', (e) => {
    if (e.target.id === 'statsModal') $('statsModal').classList.add('hidden');
  });
}

function fillBlockFilter() {
  const blocks = ['Все блоки', ...new Set(questions.map(q => q.block).filter(Boolean))];
  $('blockFilter').innerHTML = blocks.map(b => `<option value="${escapeAttr(b)}">${escapeHtml(b)}</option>`).join('');
}

function restoreStudentUi() {
  if (activeSession && !activeSession.finished) {
    $('playerName').value = activeSession.player || '';
    $('continueQuizBtn').disabled = false;
  } else {
    $('continueQuizBtn').disabled = true;
  }
}

function startNewSession() {
  const player = $('playerName').value.trim();
  if (!player) return alert('Введите ник игрока. Так потом будет видно статистику.');
  const block = $('blockFilter').value || 'Все блоки';
  const ids = getQuestionsByBlock(block).map(q => q.id);
  if (!ids.length) return alert('В выбранном блоке нет вопросов.');

  activeSession = {
    id: makeId(),
    player,
    block,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    finished: false,
    questionIds: ids,
    masteredIds: [],
    // progress: сколько раз пользователь правильно ответил на каждый вопрос.
    // Вопрос считается закреплённым после 2 правильных ответов.
    progress: Object.fromEntries(ids.map(id => [id, 0])),
    correct: 0,
    wrong: 0,
    totalAttempts: 0,
    answers: [],
    lastQuestionId: null
  };
  saveActiveSession();
  saveOrUpdateSession(activeSession);
  enterQuizMode();
  nextRandomQuestion();
}

function continueSession() {
  activeSession = loadActiveSession();
  if (!activeSession || activeSession.finished) return alert('Нет активной тренировки. Начните новую.');
  enterQuizMode();
  nextRandomQuestion();
}

function finishSession() {
  if (!activeSession) return;
  activeSession.finished = true;
  activeSession.updatedAt = Date.now();
  saveActiveSession();
  saveOrUpdateSession(activeSession);
  $('quizArea').classList.add('hidden');
  $('startCard').classList.remove('hidden');
  restoreStudentUi();
  showStatsModal();
}

function enterQuizMode() {
  $('startCard').classList.add('hidden');
  $('quizArea').classList.remove('hidden');
  $('quizPlayerLabel').textContent = activeSession.player;
}

function getQuestionsByBlock(block) {
  const list = block === 'Все блоки' ? questions : questions.filter(q => q.block === block);
  return list.filter(q => q && q.id != null);
}

function nextRandomQuestion() {
  if (!activeSession) return;
  ensureMemoryFields(activeSession);
  const ids = activeSession.questionIds;
  const remaining = ids.filter(id => (activeSession.progress[id] || 0) < 2);
  updateProgress();

  if (!remaining.length) {
    activeSession.finished = true;
    activeSession.updatedAt = Date.now();
    saveActiveSession();
    saveOrUpdateSession(activeSession);
    $('questionCard').innerHTML = `<h2>Тренировка завершена</h2><p>Все вопросы закреплены: каждый вопрос был отвечен правильно два раза.</p><button class="primary" onclick="showStatsModal()">Показать статистику</button>`;
    return;
  }

  let pool = remaining;
  if (remaining.length > 1 && activeSession.lastQuestionId != null) {
    const withoutLast = remaining.filter(id => Number(id) !== Number(activeSession.lastQuestionId));
    if (withoutLast.length) pool = withoutLast;
  }

  const randomId = pool[Math.floor(Math.random() * pool.length)];
  currentQuestion = questions.find(q => Number(q.id) === Number(randomId));
  activeSession.lastQuestionId = randomId;
  answeredCurrent = false;
  renderCurrentQuestion();
}

function ensureMemoryFields(session) {
  if (!session.progress) session.progress = {};
  if (!Array.isArray(session.masteredIds)) session.masteredIds = [];
  if (typeof session.totalAttempts !== 'number') session.totalAttempts = session.answers ? session.answers.length : 0;
  (session.questionIds || []).forEach(id => {
    if (typeof session.progress[id] !== 'number') session.progress[id] = 0;
  });
  session.masteredIds = (session.questionIds || []).filter(id => (session.progress[id] || 0) >= 2);
}

function updateProgress() {
  if (!activeSession) return;
  ensureMemoryFields(activeSession);
  const total = activeSession.questionIds.length;
  const mastered = activeSession.masteredIds.length;
  const remaining = total - mastered;
  const attempts = activeSession.totalAttempts || 0;
  $('quizProgress').textContent = ` · закреплено ${mastered} из ${total} · осталось ${remaining} · попыток ${attempts} · верно ${activeSession.correct} · ошибок ${activeSession.wrong}`;
}

function renderCurrentQuestion() {
  const q = currentQuestion;
  if (!q) return;
  const type = q.type || (q.correct.length > 1 ? 'multi' : 'single');
  const inputType = type === 'multi' ? 'checkbox' : 'radio';
  const image = q.image ? `<img class="question-img" src="${escapeAttr(q.image)}" alt="Изображение к вопросу" onerror="this.style.display='none'">` : '';
  let answerHtml = '';

  if (type === 'order') {
    answerHtml = `<div class="options-list">${q.options.map(opt => `<div class="plain-option"><b>${escapeHtml(opt[0])}.</b> ${escapeHtml(opt[1])}</div>`).join('')}</div>
      <label>Введите буквы в правильном порядке через запятую
        <input id="orderAnswer" placeholder="Например: В, Б, А, Г" />
      </label>`;
  } else {
    answerHtml = `<div class="options-list">${q.options.map(opt => {
      const [letter, text] = opt;
      return `<label class="option" data-letter="${escapeAttr(letter)}"><input type="${inputType}" name="answer" value="${escapeAttr(letter)}"> <b>${escapeHtml(letter)}.</b> ${escapeHtml(text)}</label>`;
    }).join('')}</div>`;
  }

  $('questionCard').innerHTML = `
    <div class="question-meta">${escapeHtml(q.block || 'Без блока')} · вопрос ${escapeHtml(String(q.id))}</div>
    <h2>${escapeHtml(q.text)}</h2>
    ${image}
    ${answerHtml}
    <div id="feedback" class="feedback hidden"></div>
    <div class="controls">
      <button id="checkAnswerBtn" class="primary">Ответить</button>
      <button id="nextQuestionBtn" class="hidden">Следующий вопрос</button>
    </div>`;
  $('checkAnswerBtn').addEventListener('click', checkCurrentAnswer);
  $('nextQuestionBtn').addEventListener('click', nextRandomQuestion);
}

function checkCurrentAnswer() {
  if (!currentQuestion || answeredCurrent) return;
  ensureMemoryFields(activeSession);
  const q = currentQuestion;
  const type = q.type || (q.correct.length > 1 ? 'multi' : 'single');
  let selected = [];
  if (type === 'order') {
    selected = parseLetters($('orderAnswer').value);
  } else {
    selected = [...document.querySelectorAll('input[name="answer"]:checked')].map(i => i.value);
  }
  if (!selected.length) return alert('Выберите или введите ответ.');

  const ok = type === 'order' ? arraysEqual(selected, q.correct) : arraysEqual([...selected].sort(), [...q.correct].sort());
  answeredCurrent = true;
  activeSession.totalAttempts = (activeSession.totalAttempts || 0) + 1;
  activeSession.updatedAt = Date.now();

  const before = activeSession.progress[q.id] || 0;
  let masteredNow = false;
  if (ok) {
    activeSession.correct += 1;
    activeSession.progress[q.id] = Math.min(2, before + 1);
    masteredNow = before < 2 && activeSession.progress[q.id] >= 2;
  } else {
    activeSession.wrong += 1;
    // Ошибка не удаляет прошлое закрепление, но вопрос остаётся в очереди, пока не набраны 2 правильных ответа.
    activeSession.progress[q.id] = before;
  }
  ensureMemoryFields(activeSession);

  const correctText = formatCorrectAnswer(q);
  activeSession.answers.push({
    questionId: q.id,
    question: q.text,
    block: q.block || '',
    selected: selected.join(', '),
    correct: q.correct.join(', '),
    ok,
    explanation: q.explanation || '',
    progressAfter: activeSession.progress[q.id] || 0,
    masteredNow,
    time: Date.now()
  });
  saveActiveSession();
  saveOrUpdateSession(activeSession);
  updateProgress();

  if (type !== 'order') markOptions(q, selected);
  const fb = $('feedback');
  fb.classList.remove('hidden');
  fb.className = `feedback ${ok ? 'good' : 'bad'}`;

  if (ok) {
    const progress = activeSession.progress[q.id] || 0;
    const msg = progress >= 2
      ? '✅ <b>Верно! Вопрос закреплён и больше не появится.</b>'
      : '✅ <b>Верно! Вопрос появится ещё один раз для закрепления.</b>';
    fb.innerHTML = `${msg}<br>${escapeHtml(q.explanation || '')}`;
  } else {
    fb.innerHTML = `❌ <b>Неверно.</b><br>Правильный ответ: <b>${escapeHtml(correctText)}</b><br>${escapeHtml(q.explanation || '')}<br><span class="small">Этот вопрос обязательно встретится ещё раз.</span>`;
  }

  $('checkAnswerBtn').classList.add('hidden');
  $('nextQuestionBtn').classList.remove('hidden');
}

function markOptions(q, selected) {
  document.querySelectorAll('.option').forEach(label => {
    const letter = label.dataset.letter;
    if (q.correct.includes(letter)) label.classList.add('correct');
    if (selected.includes(letter) && !q.correct.includes(letter)) label.classList.add('wrong');
    const input = label.querySelector('input');
    if (input) input.disabled = true;
  });
}

function formatCorrectAnswer(q) {
  return q.correct.map(letter => {
    const opt = q.options.find(o => o[0] === letter);
    return opt ? `${letter} — ${opt[1]}` : letter;
  }).join('; ');
}

function saveOrUpdateSession(session) {
  const sessions = loadSessions();
  const idx = sessions.findIndex(s => s.id === session.id);
  if (idx >= 0) sessions[idx] = structuredClone(session);
  else sessions.push(structuredClone(session));
  saveSessions(sessions);
}

function showStatsModal() {
  const session = activeSession || loadActiveSession();
  $('statsModal').classList.remove('hidden');
  $('statsContent').innerHTML = renderSessionStats(session);
}

function renderSessionStats(session) {
  if (!session) return '<p>Пока нет активной статистики.</p>';
  ensureMemoryFields(session);
  const attempts = session.totalAttempts || 0;
  const mastered = session.masteredIds.length;
  const totalQuestions = session.questionIds.length;
  const remaining = Math.max(0, totalQuestions - mastered);
  const spent = formatDuration(((session.finished ? session.updatedAt : Date.now()) - session.startedAt) / 1000);
  const percent = attempts ? Math.round(session.correct / attempts * 100) : 0;
  const mistakes = session.answers.filter(a => !a.ok);
  const notMastered = session.questionIds
    .filter(id => (session.progress[id] || 0) < 2)
    .map(id => {
      const q = questions.find(item => Number(item.id) === Number(id));
      return q ? `№${q.id}: ${q.text} (${session.progress[id] || 0}/2)` : `№${id} (${session.progress[id] || 0}/2)`;
    });
  const mistakesHtml = mistakes.length ? `<h3>Ошибки</h3><ol>${mistakes.map(m => `<li><b>№${escapeHtml(String(m.questionId))}</b> ${escapeHtml(m.question)}<br>Ваш ответ: ${escapeHtml(m.selected || '—')}<br>Правильно: ${escapeHtml(m.correct)}<br><span class="small">${escapeHtml(m.explanation || '')}</span></li>`).join('')}</ol>` : '<p>Ошибок пока нет.</p>';
  const remainingHtml = notMastered.length ? `<h3>Ещё не закреплены</h3><ol>${notMastered.slice(0, 25).map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ol>${notMastered.length > 25 ? '<p class="small">Показаны первые 25.</p>' : ''}` : '<p>Все вопросы закреплены.</p>';
  return `<div class="stats-grid">
      <div><b>Игрок</b><span>${escapeHtml(session.player)}</span></div>
      <div><b>Блок</b><span>${escapeHtml(session.block)}</span></div>
      <div><b>Закреплено</b><span>${mastered} из ${totalQuestions}</span></div>
      <div><b>Осталось</b><span>${remaining}</span></div>
      <div><b>Попыток</b><span>${attempts}</span></div>
      <div><b>Верно</b><span>${session.correct}</span></div>
      <div><b>Ошибок</b><span>${session.wrong}</span></div>
      <div><b>Процент</b><span>${percent}%</span></div>
      <div><b>Время</b><span>${spent}</span></div>
      <div><b>Статус</b><span>${session.finished ? (mastered >= totalQuestions ? 'всё закреплено' : 'остановлено') : 'идёт'}</span></div>
    </div>${remainingHtml}${mistakesHtml}`;
}

function bindAdmin() {
  $('loginBtn').addEventListener('click', () => {
    if ($('adminPassword').value === getAdminPassword()) {
      adminLoggedIn = true;
      $('loginCard').classList.add('hidden');
      $('editorCard').classList.remove('hidden');
      $('loginError').textContent = '';
      renderAdminList();
      renderAdminStats();
    } else {
      $('loginError').textContent = 'Неверный пароль.';
    }
  });
  $('logoutBtn').addEventListener('click', () => {
    adminLoggedIn = false;
    $('loginCard').classList.remove('hidden');
    $('editorCard').classList.add('hidden');
    $('adminPassword').value = '';
  });

  document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => switchAdminTab(btn.dataset.tab)));
  $('addQuestionBtn').addEventListener('click', addQuestion);
  $('exportBtn').addEventListener('click', exportQuestionsJson);
  $('importInput').addEventListener('change', importQuestionsJson);
  $('resetBtn').addEventListener('click', resetQuestions);
  $('refreshStatsBtn').addEventListener('click', renderAdminStats);
  $('exportStatsJsonBtn').addEventListener('click', exportStatsJson);
  $('exportStatsCsvBtn').addEventListener('click', exportStatsCsv);
  $('clearStatsBtn').addEventListener('click', clearStats);
  $('changePasswordBtn').addEventListener('click', changePassword);
}

function switchAdminTab(tabId) {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('hidden', p.id !== tabId));
  if (tabId === 'statsTab') renderAdminStats();
}

function renderAdminList() {
  $('questionList').innerHTML = questions.map((q, idx) => editorHtml(q, idx)).join('');
  questions.forEach((q, idx) => bindEditor(idx));
}

function editorHtml(q, idx) {
  const optionsHtml = q.options.map((opt, optIdx) => optionEditorHtml(idx, optIdx, opt[0], opt[1])).join('');
  const preview = q.image ? `<img class="admin-preview" src="${escapeAttr(q.image)}" onerror="this.style.display='none'" alt="preview">` : '';
  return `<div class="editor" id="editor-${idx}">
    <h3>Вопрос ${escapeHtml(String(q.id))}</h3>
    <div class="editor-grid">
      <label>ID<input id="q${idx}id" type="number" value="${escapeAttr(q.id)}"></label>
      <label>Блок<input id="q${idx}block" value="${escapeAttr(q.block || '')}"></label>
    </div>
    <label>Текст вопроса<textarea id="q${idx}text" rows="3">${escapeHtml(q.text)}</textarea></label>
    <div class="grid2">
      <label>Ссылка на картинку<input id="q${idx}image" value="${escapeAttr(q.image || '')}" placeholder="assets/q1.jpg или https://..."></label>
      <label>Загрузить картинку файлом<input id="q${idx}imageFile" type="file" accept="image/*"></label>
    </div>
    ${preview}
    <label>Правильные буквы<input id="q${idx}correct" value="${escapeAttr((q.correct || []).join(', '))}" placeholder="А или А, Б"></label>
    <label>Тип вопроса
      <select id="q${idx}type">
        <option value="single" ${q.type === 'single' || !q.type ? 'selected' : ''}>Один ответ</option>
        <option value="multi" ${q.type === 'multi' ? 'selected' : ''}>Несколько ответов</option>
        <option value="order" ${q.type === 'order' ? 'selected' : ''}>Порядок</option>
      </select>
    </label>
    <label>Пояснение<textarea id="q${idx}explanation" rows="3">${escapeHtml(q.explanation || '')}</textarea></label>
    <h4>Варианты ответа</h4>
    <div id="options-${idx}">${optionsHtml}</div>
    <div class="admin-actions">
      <button type="button" data-action="add-option" data-qidx="${idx}">Добавить вариант</button>
      <button type="button" class="primary" data-action="save-question" data-qidx="${idx}">Сохранить</button>
      <button type="button" class="danger" data-action="delete-question" data-qidx="${idx}">Удалить</button>
    </div>
  </div>`;
}

function optionEditorHtml(qidx, optIdx, letter, text) {
  return `<div class="option-row">
    <label>Буква<input id="q${qidx}o${optIdx}letter" value="${escapeAttr(letter || '')}"></label>
    <label>Вариант ответа<input id="q${qidx}o${optIdx}text" value="${escapeAttr(text || '')}"></label>
    <button type="button" data-action="delete-option" data-qidx="${qidx}" data-oidx="${optIdx}">Удалить</button>
  </div>`;
}

function bindEditor(idx) {
  const fileInput = $(`q${idx}imageFile`);
  if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const dataUrl = await fileToDataUrl(file);
      $(`q${idx}image`).value = dataUrl;
      alert('Картинка добавлена в поле ссылки как встроенный файл. Нажмите «Сохранить».');
    });
  }
  const editor = $(`editor-${idx}`);
  editor.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const action = btn.dataset.action;
    const qidx = Number(btn.dataset.qidx);
    const oidx = Number(btn.dataset.oidx);
    if (action === 'save-question') saveQuestionFromEditor(qidx);
    if (action === 'delete-question') deleteQuestion(qidx);
    if (action === 'add-option') addOption(qidx);
    if (action === 'delete-option') deleteOption(qidx, oidx);
  });
}

function saveQuestionFromEditor(idx) {
  const optionRows = [...document.querySelectorAll(`#options-${idx} .option-row`)];
  const opts = optionRows.map((_, optIdx) => [
    $(`q${idx}o${optIdx}letter`)?.value.trim(),
    $(`q${idx}o${optIdx}text`)?.value.trim()
  ]).filter(o => o[0] && o[1]);

  questions[idx] = {
    id: Number($(`q${idx}id`).value),
    block: $(`q${idx}block`).value.trim(),
    text: $(`q${idx}text`).value.trim(),
    image: $(`q${idx}image`).value.trim(),
    options: opts,
    correct: parseLetters($(`q${idx}correct`).value),
    explanation: $(`q${idx}explanation`).value.trim(),
    type: $(`q${idx}type`).value
  };
  saveQuestions();
  fillBlockFilter();
  renderAdminList();
  alert('Вопрос сохранён.');
}

function addQuestion() {
  const nextId = Math.max(0, ...questions.map(q => Number(q.id) || 0)) + 1;
  questions.push({id: nextId, block:'Новый блок', text:'Новый вопрос', image:'', options:[['А','Вариант А'],['Б','Вариант Б']], correct:['А'], explanation:'Пояснение', type:'single'});
  saveQuestions();
  renderAdminList();
  fillBlockFilter();
}

function deleteQuestion(idx) {
  if (!confirm('Удалить вопрос?')) return;
  questions.splice(idx, 1);
  saveQuestions();
  renderAdminList();
  fillBlockFilter();
}

function addOption(idx) {
  questions[idx].options.push(['', '']);
  renderAdminList();
}

function deleteOption(idx, optIdx) {
  questions[idx].options.splice(optIdx, 1);
  renderAdminList();
}

function exportQuestionsJson() {
  downloadFile('zarnitsa-questions.json', JSON.stringify(questions, null, 2), 'application/json');
}

function importQuestionsJson(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!Array.isArray(imported)) throw new Error('JSON должен быть массивом вопросов');
      questions = imported;
      saveQuestions();
      fillBlockFilter();
      renderAdminList();
      alert('Вопросы импортированы.');
    } catch (err) {
      alert('Ошибка импорта: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function resetQuestions() {
  if (!confirm('Сбросить вопросы к начальным?')) return;
  questions = structuredClone(DEFAULT_QUESTIONS);
  saveQuestions();
  fillBlockFilter();
  renderAdminList();
}

function renderAdminStats() {
  const sessions = loadSessions().sort((a,b) => b.updatedAt - a.updatedAt);
  if (!sessions.length) {
    $('adminStatsBox').innerHTML = '<p>Статистики пока нет.</p>';
    return;
  }
  $('adminStatsBox').innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Ник</th><th>Блок</th><th>Закреплено</th><th>Осталось</th><th>Попыток</th><th>Верно</th><th>Ошибок</th><th>%</th><th>Время</th><th>Статус</th><th>Обновлено</th></tr></thead>
    <tbody>${sessions.map(s => {
      ensureMemoryFields(s);
      const total = s.questionIds.length;
      const mastered = s.masteredIds.length;
      const remaining = total - mastered;
      const attempts = s.totalAttempts || 0;
      const percent = attempts ? Math.round(s.correct / attempts * 100) : 0;
      const spent = formatDuration(((s.finished ? s.updatedAt : Date.now()) - s.startedAt) / 1000);
      return `<tr><td>${escapeHtml(s.player)}</td><td>${escapeHtml(s.block)}</td><td>${mastered}/${total}</td><td>${remaining}</td><td>${attempts}</td><td>${s.correct}</td><td>${s.wrong}</td><td>${percent}%</td><td>${spent}</td><td>${s.finished ? (mastered >= total ? 'всё закреплено' : 'остановлено') : 'идёт'}</td><td>${new Date(s.updatedAt).toLocaleString('ru-RU')}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}

function exportStatsJson() {
  downloadFile('zarnitsa-stats.json', JSON.stringify(loadSessions(), null, 2), 'application/json');
}

function exportStatsCsv() {
  const rows = [['Ник','Блок','Закреплено','Всего вопросов','Осталось','Попыток','Верно','Ошибок','Процент','Время','Статус','Обновлено']];
  loadSessions().forEach(s => {
    ensureMemoryFields(s);
    const total = s.questionIds.length;
    const mastered = s.masteredIds.length;
    const remaining = total - mastered;
    const attempts = s.totalAttempts || 0;
    const percent = attempts ? Math.round(s.correct / attempts * 100) : 0;
    rows.push([s.player, s.block, mastered, total, remaining, attempts, s.correct, s.wrong, percent + '%', formatDuration(((s.finished ? s.updatedAt : Date.now()) - s.startedAt) / 1000), s.finished ? (mastered >= total ? 'всё закреплено' : 'остановлено') : 'идёт', new Date(s.updatedAt).toLocaleString('ru-RU')]);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replaceAll('"','""')}"`).join(';')).join('\n');
  downloadFile('zarnitsa-memory-stats.csv', csv, 'text/csv;charset=utf-8');
}

function clearStats() {
  if (!confirm('Очистить всю статистику в этом браузере?')) return;
  localStorage.removeItem(KEYS.sessions);
  renderAdminStats();
}

function changePassword() {
  const p1 = $('newAdminPassword').value;
  const p2 = $('repeatAdminPassword').value;
  if (!p1 || p1.length < 3) return $('passwordMessage').textContent = 'Пароль должен быть не короче 3 символов.';
  if (p1 !== p2) return $('passwordMessage').textContent = 'Пароли не совпадают.';
  localStorage.setItem(KEYS.password, p1);
  $('newAdminPassword').value = '';
  $('repeatAdminPassword').value = '';
  $('passwordMessage').textContent = 'Пароль изменён.';
}

function parseLetters(text) {
  return String(text || '').replaceAll(';', ',').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function makeId() {
  return 's_' + Date.now() + '_' + Math.random().toString(16).slice(2);
}

function formatDuration(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h ? `${h} ч ${m} мин ${s} сек` : `${m} мин ${s} сек`;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], {type});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/`/g, '&#96;');
}
