const PROMPT = "What is the capital of France?";

const TOKEN_ROUNDS = [
  {
    chosen: "\n\n",
    contenders: [
      { token: "\n\n", prob: 90.5128 },
      { token: "\n", prob: 7.5592 },
      { token: "The", prob: 0.7484 },
      { token: " \n\n", prob: 0.6992 },
      { token: " The", prob: 0.2022 },
      { token: "\r\n\r\n", prob: 0.0926 },
      { token: " \n", prob: 0.0796 },
      { token: "Paris", prob: 0.0447 },
      { token: "\n\n\n", prob: 0.0378 },
      { token: " Paris", prob: 0.0234 },
    ],
  },
  {
    chosen: "The",
    contenders: [
      { token: "The", prob: 95.7863 },
      { token: "Paris", prob: 4.1502 },
      { token: "As", prob: 0.0447 },
      { token: " The", prob: 0.0054 },
      { token: "the", prob: 0.0047 },
      { token: "Th", prob: 0.0026 },
      { token: "\n", prob: 0.0023 },
      { token: "T", prob: 0.0015 },
      { token: "There", prob: 0.0013 },
      { token: "Par", prob: 0.001 },
    ],
  },
  {
    chosen: " capital",
    contenders: [
      { token: " capital", prob: 99.9819 },
      { token: " current", prob: 0.0048 },
      { token: " ", prob: 0.0037 },
      { token: " capita", prob: 0.0022 },
      { token: " c", prob: 0.0017 },
      { token: " city", prob: 0.0017 },
      { token: " Capital", prob: 0.0011 },
      { token: " ca", prob: 0.0011 },
      { token: "<|endoftext|>", prob: 0.001 },
      { token: " cap", prob: 0.0008 },
    ],
  },
  {
    chosen: " of",
    contenders: [
      { token: " of", prob: 99.8151 },
      { token: " city", prob: 0.1782 },
      { token: " and", prob: 0.0048 },
      { token: " ", prob: 0.0012 },
      { token: " o", prob: 0.0004 },
      { token: " is", prob: 0.0001 },
      { token: "<|endoftext|>", prob: 0.0001 },
      { token: "of", prob: 0.0 },
      { token: " City", prob: 0.0 },
      { token: " or", prob: 0.0 },
    ],
  },
  {
    chosen: " France",
    contenders: [
      { token: " France", prob: 99.9833 },
      { token: " ", prob: 0.004 },
      { token: " Fr", prob: 0.0032 },
      { token: " F", prob: 0.0025 },
      { token: " france", prob: 0.0021 },
      { token: " Fra", prob: 0.0014 },
      { token: " Fran", prob: 0.0011 },
      { token: "<|endoftext|>", prob: 0.0009 },
      { token: " Paris", prob: 0.0008 },
      { token: " the", prob: 0.0007 },
    ],
  },
  {
    chosen: " is",
    contenders: [
      { token: " is", prob: 99.9986 },
      { token: " ", prob: 0.0005 },
      { token: " in", prob: 0.0003 },
      { token: "<|endoftext|>", prob: 0.0002 },
      { token: " i", prob: 0.0001 },
      { token: ",", prob: 0.0001 },
      { token: "is", prob: 0.0001 },
      { token: " (", prob: 0.0 },
      { token: " Paris", prob: 0.0 },
      { token: "\n", prob: 0.0 },
    ],
  },
  {
    chosen: " Paris",
    contenders: [
      { token: " Paris", prob: 99.9935 },
      { token: " P", prob: 0.0042 },
      { token: " ", prob: 0.001 },
      { token: " Pa", prob: 0.0009 },
      { token: "Paris", prob: 0.0003 },
      { token: "\n", prob: 0.0001 },
      { token: "<|endoftext|>", prob: 0.0 },
      { token: " the", prob: 0.0 },
      { token: " Par", prob: 0.0 },
      { token: "\n\n", prob: 0.0 },
    ],
  },
  {
    chosen: ".",
    contenders: [
      { token: ".", prob: 99.4334 },
      { token: ".\n", prob: 0.5406 },
      { token: "<|endoftext|>", prob: 0.0105 },
      { token: ".\n\n", prob: 0.0078 },
      { token: ",", prob: 0.0064 },
      { token: " ", prob: 0.0006 },
      { token: " .", prob: 0.0004 },
      { token: " (", prob: 0.0002 },
      { token: "\n", prob: 0.0001 },
      { token: ".\r\n", prob: 0.0 },
    ],
  },
];

const TIMING = {
  typingMs: 55,
  postEnterPauseMs: 400,
  passSetupMs: 980,
  machineryMs: 240,
  cycleTickMs: 85,
  cycleTicks: 10,
  settleStaggerMs: 110,
  selectTransferMs: 1200,
  betweenRoundsMs: 520,
  fadeClearDelayMs: 220,
};
const DISPLAY_TOP_K = 5;

const stepBtn = document.getElementById("stepBtn");
const goBtn = document.getElementById("goBtn");
const pauseBtn = document.getElementById("pauseBtn");
const backBtn = document.getElementById("backBtn");
const resetBtn = document.getElementById("resetBtn");

const chatThread = document.getElementById("chatThread");
const chatInput = document.getElementById("chatInput");
const tableWrap = document.querySelector(".table-wrap");
const tokenBody = document.querySelector(".token-table tbody");
const passTitle = document.getElementById("passTitle");
const passList = document.getElementById("passList");
const pipelineScene = document.getElementById("pipelineScene");
const machineryStatus = document.getElementById("machineryStatus");

let tokenEls = [];
let barEls = [];
let scoreEls = [];

const state = {
  running: false,
  paused: false,
  finished: false,
  runMode: "step",
  timeoutId: null,
  fadeTimeoutId: null,
  stepIndex: 0,
  answerText: "",
  replayMode: false,
  checkpoints: [0],
  checkpointIndex: 0,
};

function escapeToken(value) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
}

function formatToken(value) {
  return `'${escapeToken(value)}'`;
}

function formatProbability(prob) {
  let text = prob.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  if (!text.includes(".")) text = `${text}.0`;
  return `${text}%`;
}

function createProbabilityRows() {
  const rowCount = Math.min(DISPLAY_TOP_K, TOKEN_ROUNDS[0].contenders.length);
  tokenBody.innerHTML = "";
  tokenEls = [];
  barEls = [];
  scoreEls = [];

  for (let i = 0; i < rowCount; i += 1) {
    const row = document.createElement("tr");

    const tokenCell = document.createElement("td");
    tokenCell.id = `token${i}`;

    const scoreCell = document.createElement("td");
    const scoreWrap = document.createElement("div");
    scoreWrap.className = "score-cell";

    const barTrack = document.createElement("div");
    barTrack.className = "bar-track";

    const bar = document.createElement("div");
    bar.className = "bar";
    bar.id = `bar${i}`;

    const score = document.createElement("span");
    score.className = "score-value";
    score.id = `score${i}`;
    score.textContent = "0%";

    barTrack.appendChild(bar);
    scoreWrap.appendChild(barTrack);
    scoreWrap.appendChild(score);
    scoreCell.appendChild(scoreWrap);

    row.appendChild(tokenCell);
    row.appendChild(scoreCell);
    tokenBody.appendChild(row);

    tokenEls.push(tokenCell);
    barEls.push(bar);
    scoreEls.push(score);
  }
}

function buildSteps() {
  const builtSteps = [
    { duration: 0, action: initTyping },
    ...PROMPT.split("").map((char) => ({ duration: TIMING.typingMs, action: () => typeChar(char) })),
    { duration: TIMING.postEnterPauseMs, action: pressEnter },
  ];

  TOKEN_ROUNDS.forEach((round, roundIndex) => {
    const visibleContenders = round.contenders.slice(0, DISPLAY_TOP_K);

    builtSteps.push({ duration: TIMING.passSetupMs, action: () => beginPass(roundIndex) });
    builtSteps.push({ duration: TIMING.machineryMs, action: startMachinery });

    builtSteps.push(
      ...Array.from({ length: TIMING.cycleTicks }, (_, tick) => ({
        duration: TIMING.cycleTickMs,
        action: () => cycleRound(roundIndex, tick),
      }))
    );

    builtSteps.push(
      ...visibleContenders.map((_, rowIndex) => ({
        duration: TIMING.settleStaggerMs,
        action: () => settleRoundRow(roundIndex, rowIndex),
      }))
    );

    builtSteps.push({
      duration: TIMING.selectTransferMs,
      action: () => selectAndTransferTopToken(roundIndex),
      pauseAfter: true,
    });

    if (roundIndex < TOKEN_ROUNDS.length - 1) {
      builtSteps.push({ duration: TIMING.betweenRoundsMs, action: prepNextRound });
    }
  });

  builtSteps.push({ duration: 0, action: finalizeAnswer });
  builtSteps.push({ duration: 0, action: finish });
  return builtSteps;
}

const steps = buildSteps();

function clearTimer() {
  if (state.timeoutId) {
    clearTimeout(state.timeoutId);
    state.timeoutId = null;
  }
}

function clearFadeTimer() {
  if (state.fadeTimeoutId) {
    clearTimeout(state.fadeTimeoutId);
    state.fadeTimeoutId = null;
  }
}

function setControls() {
  const runLocked = state.running && !state.finished && !state.paused;
  stepBtn.disabled = runLocked;
  goBtn.disabled = runLocked;
  pauseBtn.disabled = !state.running || state.finished;
  pauseBtn.textContent = state.paused ? "Resume" : "Pause";
  backBtn.disabled = !state.paused || state.checkpointIndex <= 0 || state.finished;
}

function clearCandidateTable() {
  tokenEls.forEach((el) => {
    el.textContent = "";
    el.dataset.rawToken = "";
    el.classList.remove("chosen-token");
  });
  barEls.forEach((bar) => {
    bar.style.width = "0%";
  });
  scoreEls.forEach((el) => {
    el.textContent = "0%";
  });
}

function setPipelineStage(stage) {
  if (pipelineScene) pipelineScene.dataset.stage = stage;
  if (!machineryStatus) return;

  if (stage === "encoding") machineryStatus.textContent = "Encoding Prompt";
  else if (stage === "computing") machineryStatus.textContent = "Running Forward Pass";
  else if (stage === "decoded") machineryStatus.textContent = "Decoded Top Candidates";
  else if (stage === "done") machineryStatus.textContent = "Generation Complete";
  else machineryStatus.textContent = "Idle";
}

function setRow(row, token, prob) {
  tokenEls[row].textContent = formatToken(token);
  tokenEls[row].dataset.rawToken = token;
  barEls[row].style.width = `${prob}%`;
  scoreEls[row].textContent = formatProbability(prob);
}

function resetVisuals() {
  chatThread.innerHTML = "";
  chatInput.textContent = "";
  chatInput.classList.remove("typing");
  tableWrap.classList.remove("fading");
  passTitle.textContent = "Pass Input";
  renderPassSequence([]);
  clearCandidateTable();
  setPipelineStage("idle");

  document.querySelectorAll(".star-burst, .flying-token").forEach((el) => {
    el.remove();
  });
}

function initTyping() {
  chatInput.classList.add("typing");
}

function typeChar(char) {
  chatInput.textContent += char;
}

function pressEnter() {
  const msg = document.createElement("div");
  msg.className = "message";
  msg.textContent = PROMPT;
  chatThread.prepend(msg);

  const assistantMsg = document.createElement("div");
  assistantMsg.className = "assistant-message";
  assistantMsg.innerHTML =
    '<span class="answer-slot" id="answerSlot"></span><span class="answer-meta"><span class="generation-cursor visible" id="generationCursor">|</span><span class="final-status" id="finalStatus">Final</span></span>';
  msg.after(assistantMsg);

  chatInput.textContent = "";
  chatInput.classList.remove("typing");
}

function tokenizeForPass(text) {
  const normalized = text.replace(/\r\n/g, "\n");
  const tokens = [];
  let i = 0;

  while (i < normalized.length) {
    const ch = normalized[i];
    if (ch === " " || ch === "\t") {
      i += 1;
      continue;
    }
    if (ch === "\n") {
      tokens.push("\\n");
      i += 1;
      continue;
    }

    const wordMatch = normalized.slice(i).match(/^[A-Za-z0-9]+/);
    if (wordMatch) {
      tokens.push(wordMatch[0]);
      i += wordMatch[0].length;
      continue;
    }

    tokens.push(ch);
    i += 1;
  }

  return tokens;
}

function tokenToId(token, index) {
  let hash = 17;
  for (const ch of token) {
    hash = (hash * 31 + ch.charCodeAt(0)) % 50000;
  }
  return 1000 + hash + index;
}

function renderPassSequence(sequence) {
  const MIN_PASS_ROWS = 10;
  passList.innerHTML = "";
  const padded = [...sequence];
  while (padded.length < MIN_PASS_ROWS) padded.push("");

  padded.forEach((token, index) => {
    const row = document.createElement("tr");
    row.dataset.seqIndex = String(index);
    const wordCell = document.createElement("td");
    const idCell = document.createElement("td");
    wordCell.textContent = token;
    idCell.textContent = token ? String(tokenToId(token, index)) : "";
    row.appendChild(wordCell);
    row.appendChild(idCell);
    passList.appendChild(row);
  });
}

function buildPassSequence() {
  const questionTokens = tokenizeForPass(PROMPT);
  const answerTokens = tokenizeForPass(state.answerText);
  return ["<QUESTION>", ...questionTokens, "<ANSWER>", ...answerTokens];
}

function flyChatTokenToPass(sourceEl, targetEl, tokenText) {
  if (!sourceEl || !targetEl) return;

  const sourceRect = sourceEl.getBoundingClientRect();
  const targetRect = targetEl.getBoundingClientRect();
  const flyer = document.createElement("div");
  flyer.className = "flying-token";
  flyer.textContent = tokenText;
  flyer.style.left = `${sourceRect.left + sourceRect.width / 2}px`;
  flyer.style.top = `${sourceRect.top + sourceRect.height / 2}px`;
  document.body.appendChild(flyer);

  requestAnimationFrame(() => {
    flyer.classList.add("run");
    flyer.style.left = `${targetRect.left + targetRect.width / 2}px`;
    flyer.style.top = `${targetRect.top + targetRect.height / 2}px`;
  });

  setTimeout(() => {
    targetEl.classList.add("pass-hit");
    flyer.remove();
    setTimeout(() => targetEl.classList.remove("pass-hit"), 380);
  }, 900);
}

function animateLatestAnswerTokenIntoPass(sequenceLength) {
  if (state.replayMode || sequenceLength <= 0) return;

  const answerSlot = document.getElementById("answerSlot");
  if (!answerSlot) return;
  const tokenElsInAnswer = answerSlot.querySelectorAll(".answer-token");
  const source = tokenElsInAnswer[tokenElsInAnswer.length - 1];
  if (!source) return;

  const targetRow = passList.querySelector(`tr[data-seq-index="${sequenceLength - 1}"]`);
  const targetCell = targetRow ? targetRow.children[0] : null;
  if (!targetCell) return;

  const label = targetCell.textContent || source.textContent || "";
  flyChatTokenToPass(source, targetCell, label);
}

function beginPass(roundIndex) {
  const sequence = buildPassSequence();
  passTitle.textContent = `Pass ${roundIndex + 1}: Encoded Prompt`;
  renderPassSequence(sequence);
  if (roundIndex > 0) animateLatestAnswerTokenIntoPass(sequence.length);
  clearCandidateTable();
  setPipelineStage("encoding");
}

function startMachinery() {
  setPipelineStage("computing");
}

function cycleRound(roundIndex, tick) {
  const contenders = TOKEN_ROUNDS[roundIndex].contenders.slice(0, DISPLAY_TOP_K);
  tokenEls.forEach((_, rowIndex) => {
    const contender = contenders[(rowIndex + tick) % contenders.length];
    setRow(rowIndex, contender.token, contender.prob);
  });
}

function settleRoundRow(roundIndex, rowIndex) {
  const contender = TOKEN_ROUNDS[roundIndex].contenders[rowIndex];
  setRow(rowIndex, contender.token, contender.prob);
  if (rowIndex === 0) setPipelineStage("decoded");
}

function prepNextRound() {
  const clearProbabilityTable = () => {
    clearCandidateTable();
    tableWrap.classList.remove("fading");
  };

  if (state.replayMode) {
    clearProbabilityTable();
    return;
  }

  clearFadeTimer();
  tableWrap.classList.add("fading");
  state.fadeTimeoutId = setTimeout(() => {
    clearProbabilityTable();
    state.fadeTimeoutId = null;
  }, TIMING.fadeClearDelayMs);
}

function selectAndTransferTopToken(roundIndex) {
  const source = tokenEls[0];
  const target = document.getElementById("answerSlot");
  if (!source || !target) return;

  tokenEls.forEach((el) => {
    el.classList.remove("chosen-token");
  });
  source.classList.add("chosen-token");

  const chosenToken = TOKEN_ROUNDS[roundIndex].chosen;
  spawnStarBurst(source);
  flyTokenToTarget(source, target, chosenToken);
}

function spawnStarBurst(source) {
  if (state.replayMode) return;

  const rect = source.getBoundingClientRect();
  const burst = document.createElement("div");
  burst.className = "star-burst";
  burst.style.left = `${rect.left + rect.width / 2}px`;
  burst.style.top = `${rect.top + rect.height / 2}px`;

  for (let i = 0; i < 12; i += 1) {
    const star = document.createElement("span");
    const angle = (Math.PI * 2 * i) / 12;
    const distance = 34 + Math.random() * 26;
    const dx = `${Math.cos(angle) * distance}px`;
    const dy = `${Math.sin(angle) * distance}px`;
    star.className = "star";
    star.textContent = "✦";
    star.style.setProperty("--dx", dx);
    star.style.setProperty("--dy", dy);
    star.style.setProperty("--delay", `${Math.random() * 120}ms`);
    burst.appendChild(star);
  }

  document.body.appendChild(burst);
  setTimeout(() => burst.remove(), 900);
}

function flyTokenToTarget(source, target, tokenText) {
  const chunk = buildAnswerChunk(tokenText);

  if (state.replayMode) {
    const tokenSpan = document.createElement("span");
    tokenSpan.className = "answer-token";
    tokenSpan.textContent = chunk;
    target.appendChild(tokenSpan);
    state.answerText = `${state.answerText}${chunk}`;
    target.classList.add("visible");
    return;
  }

  const sourceRect = source.getBoundingClientRect();
  const marker = document.createElement("span");
  marker.className = "landing-marker";
  marker.textContent = chunk;
  target.appendChild(marker);
  const targetRect = marker.getBoundingClientRect();

  const flyer = document.createElement("div");
  flyer.className = "flying-token";
  flyer.textContent = formatToken(tokenText);
  flyer.style.left = `${sourceRect.left + sourceRect.width / 2}px`;
  flyer.style.top = `${sourceRect.top + sourceRect.height / 2}px`;
  document.body.appendChild(flyer);

  requestAnimationFrame(() => {
    flyer.classList.add("run");
    flyer.style.left = `${targetRect.left + Math.max(targetRect.width / 2, 18)}px`;
    flyer.style.top = `${targetRect.top + targetRect.height / 2}px`;
  });

  setTimeout(() => {
    const tokenSpan = document.createElement("span");
    tokenSpan.className = "answer-token";
    tokenSpan.textContent = chunk;
    target.appendChild(tokenSpan);
    marker.remove();
    state.answerText = `${state.answerText}${chunk}`;
    target.classList.add("visible");
    flyer.remove();
  }, 920);
}

function buildAnswerChunk(tokenText) {
  return tokenText;
}

function hideGenerationCursor() {
  const cursor = document.getElementById("generationCursor");
  if (cursor) cursor.classList.remove("visible");
}

function showFinalStatus() {
  const finalStatus = document.getElementById("finalStatus");
  if (finalStatus) finalStatus.classList.add("visible");
}

function finalizeAnswer() {
  hideGenerationCursor();
  showFinalStatus();
  setPipelineStage("done");
}

function finish() {
  state.running = false;
  state.finished = true;
  setControls();
}

function scheduleNextStep() {
  if (!state.running || state.paused) return;
  if (state.stepIndex >= steps.length) return;

  const step = steps[state.stepIndex];
  state.stepIndex += 1;
  step.action();

  state.timeoutId = setTimeout(() => {
    if (!state.running || state.paused) return;

    if (state.runMode === "step" && step.pauseAfter) {
      state.paused = true;
      recordCheckpoint(state.stepIndex);
      clearTimer();
      setControls();
      return;
    }

    scheduleNextStep();
  }, step.duration);
}

function recordCheckpoint(stepIndex) {
  if (state.checkpoints[state.checkpoints.length - 1] !== stepIndex) {
    state.checkpoints.push(stepIndex);
  }
  state.checkpointIndex = state.checkpoints.length - 1;
}

function jumpToCheckpoint(targetIndex) {
  const targetStep = state.checkpoints[targetIndex];
  if (typeof targetStep !== "number") return;

  clearTimer();
  clearFadeTimer();
  state.running = true;
  state.paused = true;
  state.finished = false;
  state.stepIndex = 0;
  state.answerText = "";
  resetVisuals();

  state.replayMode = true;
  while (state.stepIndex < targetStep && state.stepIndex < steps.length) {
    const step = steps[state.stepIndex];
    state.stepIndex += 1;
    step.action();
  }
  state.replayMode = false;

  state.checkpointIndex = targetIndex;
  state.checkpoints = state.checkpoints.slice(0, targetIndex + 1);
  setControls();
}

function startWithMode(mode) {
  if (state.running && !state.finished) {
    if (!state.paused) return;
    state.runMode = mode;
    state.paused = false;
    setControls();
    scheduleNextStep();
    return;
  }

  if (state.finished) {
    reset();
  }

  state.runMode = mode;
  state.running = true;
  state.paused = false;
  setControls();
  scheduleNextStep();
}

function startStep() {
  startWithMode("step");
}

function startGo() {
  startWithMode("go");
}

function togglePause() {
  if (!state.running || state.finished) return;

  state.paused = !state.paused;
  if (!state.paused) {
    scheduleNextStep();
  } else {
    clearTimer();
  }
  setControls();
}

function backOneStep() {
  if (!state.paused || state.finished) return;
  if (state.checkpointIndex <= 0) return;
  jumpToCheckpoint(state.checkpointIndex - 1);
}

function reset() {
  clearTimer();
  clearFadeTimer();
  state.running = false;
  state.paused = false;
  state.finished = false;
  state.runMode = "step";
  state.stepIndex = 0;
  state.answerText = "";
  state.replayMode = false;
  state.checkpoints = [0];
  state.checkpointIndex = 0;
  resetVisuals();
  setControls();
}

createProbabilityRows();
stepBtn.addEventListener("click", startStep);
goBtn.addEventListener("click", startGo);
pauseBtn.addEventListener("click", togglePause);
backBtn.addEventListener("click", backOneStep);
resetBtn.addEventListener("click", reset);

reset();
