// --- THEME MANAGEMENT ---
const htmlEl = document.documentElement;
const themeIcon = document.getElementById('theme-icon');

const savedTheme = localStorage.getItem('theme') || 'dark';
htmlEl.setAttribute('data-theme', savedTheme);
updateThemeIcon(savedTheme);

function toggleTheme() {
    const currentTheme = htmlEl.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    htmlEl.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    themeIcon.innerText = theme === 'dark' ? '🌙' : '☀️';
}


// --- GAME LOGIC ---

let score = 0;
let currentRound = 1;
let maxRounds = 5; 

let selectedSubject = "";
let selectedSemester = "";
let playerName = "Student";

let availableQuestions = [];
let usedQuestionIds = new Set(); 
let currentLevelData = []; 
let selectedQ = null;
let selectedA = null;
let isProcessing = false; 

let mistakes = new Set(); 
let isAppealMode = false;

// --- INITIALIZATION ---

document.addEventListener('DOMContentLoaded', () => {
    if (typeof GAME_DATA !== 'undefined' && GAME_DATA.length > 0) {
        const subjects = [...new Set(GAME_DATA.map(item => item.subject))].sort();
        const select = document.getElementById('subject-select');
        
        subjects.forEach(sub => {
            const opt = document.createElement('option');
            opt.value = sub;
            opt.innerText = sub;
            select.appendChild(opt);
        });
        
        // Initial load: Show all scores or empty
        loadLeaderboard();
    } else {
        alert("Game data not found! Run the Python script first.");
    }
});

function updateSemesters() {
    const subj = document.getElementById('subject-select').value;
    const semSelect = document.getElementById('semester-select');
    
    semSelect.innerHTML = '<option value="" disabled selected>Select Semester</option>';
    semSelect.disabled = true;

    if (subj) {
        let sems = new Set();
        GAME_DATA.forEach(item => {
            if (item.subject === subj) {
                item.semester.forEach(s => sems.add(s));
            }
        });
        
        const sortedSems = [...sems].sort();
        
        if (sortedSems.length === 0) {
            const opt = document.createElement('option');
            opt.innerText = "All Semesters";
            opt.value = "ALL"; 
            semSelect.appendChild(opt);
        } else {
            sortedSems.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s;
                opt.innerText = s;
                semSelect.appendChild(opt);
            });
        }
        semSelect.disabled = false;
        
        // REFRESH LEADERBOARD based on Subject selection
        refreshLeaderboardUI();
    }
}

// Called whenever Subject or Semester changes
function refreshLeaderboardUI() {
    const subj = document.getElementById('subject-select').value;
    const sem = document.getElementById('semester-select').value;
    
    // Update Title
    const title = document.getElementById('leaderboard-title');
    if (subj && sem) {
        title.innerText = `🏆 Top Scores: ${subj} (${sem})`;
    } else if (subj) {
        title.innerText = `🏆 Top Scores: ${subj}`;
    } else {
        title.innerText = `🏆 Top Scores`;
    }

    loadLeaderboard(subj, sem);
}

function startGame() {
    const nameInput = document.getElementById('username').value.trim();
    const subInput = document.getElementById('subject-select').value;
    const semInput = document.getElementById('semester-select').value;

    // --- SECRET ADMIN RESET ---
    if (nameInput === "RESET") {
        if(confirm("⚠ ADMIN MODE: Wipe all game data and high scores?")) {
            localStorage.clear();
            alert("Database Cleared.");
            location.reload();
        }
        return;
    }
    // --------------------------

    if (!nameInput) { alert("Please enter your name!"); return; }
    if (!subInput) { alert("Please select a subject!"); return; }
    if (!semInput) { alert("Please select a semester!"); return; }

    playerName = nameInput;
    selectedSubject = subInput;
    selectedSemester = semInput;
    
    // Filtering
    let rawQuestions = [];
    if (selectedSemester === "ALL") {
        rawQuestions = GAME_DATA.filter(item => item.subject === selectedSubject);
    } else {
        rawQuestions = GAME_DATA.filter(item => 
            item.subject === selectedSubject && item.semester.includes(selectedSemester)
        );
    }

    if (rawQuestions.length < 5) {
        alert(`Not enough questions found (${rawQuestions.length}). You need at least 5.`);
        return;
    }

    // Smart Sorting
    const retention = getRetentionData();
    const now = new Date().getTime();

    rawQuestions.forEach(q => {
        const data = retention[q.id] || { level: 0, nextReview: 0 };
        if (data.level === 0) q.priority = 100;
        else if (now >= data.nextReview) q.priority = 50 + data.level;
        else q.priority = 1;
        q.priority += Math.random();
    });

    availableQuestions = rawQuestions.sort((a, b) => b.priority - a.priority);

    mistakes.clear(); 
    isAppealMode = false;
    currentRound = 1;

    const startScreen = document.getElementById('start-screen');
    startScreen.style.opacity = '0';
    setTimeout(() => {
        startScreen.classList.remove('active');
        const gameScreen = document.getElementById('game-screen');
        gameScreen.classList.add('active');
        document.getElementById('player-display').innerText = playerName;
        startRound();
    }, 300);
}

// --- ROUND MANAGEMENT ---

function startRound() {
    let displayRound = isAppealMode ? "Appeal" : `${currentRound} / ${maxRounds}`;
    document.getElementById('round-display').innerText = `Round ${displayRound}`;
    
    let roundPool = [];

    if (isAppealMode) {
        roundPool = GAME_DATA.filter(item => mistakes.has(item.id));
        currentLevelData = shuffle(roundPool);
    } else {
        let freshQuestions = availableQuestions.filter(q => !usedQuestionIds.has(q.id));
        if (freshQuestions.length < 5) {
            usedQuestionIds.clear(); 
            freshQuestions = availableQuestions; 
        }
        roundPool = freshQuestions.slice(0, 5);
        roundPool.forEach(q => usedQuestionIds.add(q.id));
        currentLevelData = roundPool; 
    }
    
    renderBoard();
}

function renderBoard() {
    const qCol = document.getElementById('col-questions');
    const aCol = document.getElementById('col-answers');
    qCol.innerHTML = ''; 
    aCol.innerHTML = '';
    
    let questions = currentLevelData.map(d => ({ id: d.id, text: d.question, type: 'q' }));
    let answers = currentLevelData.map(d => ({ id: d.id, text: d.answer, type: 'a' }));
    
    shuffle(questions).forEach((q, index) => createCard(q, qCol, index));
    shuffle(answers).forEach((a, index) => createCard(a, aCol, index));
}

function createCard(item, container, index) {
    const div = document.createElement('div');
    div.className = 'card';
    div.textContent = item.text;
    div.dataset.id = item.id;
    div.dataset.type = item.type;
    div.style.animationDelay = `${index * 0.1}s`; 
    div.onclick = () => handleCardClick(div);
    container.appendChild(div);
}

// --- MATCHING LOGIC ---

function handleCardClick(card) {
    if (isProcessing) return; 
    if (card.classList.contains('matched') || card.classList.contains('selected')) return;
    
    const type = card.dataset.type;
    const currentSelected = type === 'q' ? selectedQ : selectedA;
    
    if (currentSelected) currentSelected.classList.remove('selected');
    card.classList.add('selected');
    
    if (type === 'q') selectedQ = card;
    else selectedA = card;
    
    if (selectedQ && selectedA) checkMatch();
}

function checkMatch() {
    const feedback = document.getElementById('feedback');
    const id1 = parseInt(selectedQ.dataset.id);
    const id2 = parseInt(selectedA.dataset.id);
    
    if (id1 === id2) {
        // Correct
        score += 10;
        feedback.innerText = "Excellent! +10";
        feedback.style.color = "var(--success-color)";
        
        if (!isAppealMode) updateRetention(id1, true);

        selectedQ.classList.add('matched');
        selectedA.classList.add('matched');
        selectedQ.classList.remove('selected');
        selectedA.classList.remove('selected');
        selectedQ = null; selectedA = null;
        
        const remaining = document.querySelectorAll('.card:not(.matched)');
        if (remaining.length === 0) {
            setTimeout(nextRound, 800);
        }
    } else {
        // Incorrect
        isProcessing = true; 
        score = Math.max(0, score - 5);
        feedback.innerText = "Try again! -5";
        feedback.style.color = "var(--error-color)";
        
        selectedQ.classList.add('shake');
        selectedA.classList.add('shake');

        if (!isAppealMode) updateRetention(parseInt(selectedQ.dataset.id), false);
        mistakes.add(parseInt(selectedQ.dataset.id));
        mistakes.add(parseInt(selectedA.dataset.id));
        
        setTimeout(() => {
            if(selectedQ) selectedQ.classList.remove('selected', 'shake');
            if(selectedA) selectedA.classList.remove('selected', 'shake');
            selectedQ = null; selectedA = null;
            feedback.innerText = "";
            isProcessing = false; 
        }, 600);
    }
    document.getElementById('score').innerText = score;
}

function nextRound() {
    if (isAppealMode) {
        endGame();
    } else {
        if (currentRound < maxRounds) {
            currentRound++;
            startRound();
        } else {
            endGame();
        }
    }
}

function endGame() {
    document.getElementById('game-screen').classList.remove('active');
    const endScreen = document.getElementById('end-screen');
    endScreen.classList.add('active');
    
    document.getElementById('final-score').innerText = score;

    const appealBtn = document.getElementById('appeal-btn');
    const endTitle = document.getElementById('end-title');
    const endMsg = document.getElementById('end-message');

    if (isAppealMode) {
        endTitle.innerText = "Appeal Adjourned";
        endMsg.innerText = "You have reviewed your case files.";
        appealBtn.style.display = 'none'; 
        // We generally don't save score on appeal completion, 
        // but you can if you want by calling saveScore()
    } else {
        if (mistakes.size > 0) {
            endTitle.innerText = "Session Adjourned";
            endMsg.innerText = `You have ${mistakes.size} case files pending review.`;
            appealBtn.style.display = 'inline-block';
            appealBtn.innerText = `File an Appeal (${mistakes.size} Mistakes)`;
        } else {
            endTitle.innerText = "Perfect Record!";
            endMsg.innerText = "No mistakes found. Court is dismissed.";
            appealBtn.style.display = 'none';
        }
        saveScore(); 
    }
}

function startAppealMode() {
    isAppealMode = true;
    document.getElementById('end-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');
    startRound();
}

// --- DATA UTILITIES ---

function getRetentionData() {
    return JSON.parse(localStorage.getItem('lawGameRetention') || '{}');
}

function saveRetentionData(data) {
    localStorage.setItem('lawGameRetention', JSON.stringify(data));
}

function updateRetention(questionId, isCorrect) {
    const data = getRetentionData();
    const entry = data[questionId] || { level: 0, nextReview: 0 };
    
    if (isCorrect) {
        entry.level += 1;
        const daysToAdd = Math.ceil(Math.pow(2, entry.level)); 
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + daysToAdd);
        entry.nextReview = nextDate.getTime();
    } else {
        entry.level = 0;
        entry.nextReview = 0; 
    }
    
    data[questionId] = entry;
    saveRetentionData(data);
}

function saveScore() {
    const history = JSON.parse(localStorage.getItem('lawGameScores') || '[]');
    
    // SAVE STRUCTURED DATA FOR FILTERING
    history.push({ 
        name: playerName, 
        score: score, 
        subject: selectedSubject, 
        semester: selectedSemester,
        date: new Date().toLocaleDateString()
    });
    
    // Sort and keep top 50 (Store more so we can filter later)
    history.sort((a, b) => b.score - a.score);
    localStorage.setItem('lawGameScores', JSON.stringify(history.slice(0, 50)));
}

function loadLeaderboard(filterSubj = null, filterSem = null) {
    const tbody = document.getElementById('leaderboard-body');
    const history = JSON.parse(localStorage.getItem('lawGameScores') || '[]');
    
    // FILTER LOGIC
    let filtered = history;
    if (filterSubj) {
        filtered = filtered.filter(item => item.subject === filterSubj);
    }
    if (filterSem) {
        filtered = filtered.filter(item => item.semester === filterSem);
    }

    tbody.innerHTML = filtered.length ? '' : '<tr><td colspan="4" style="text-align:center; color: var(--text-secondary);">No scores yet.</td></tr>';
    
    // Show top 5 of the filtered results
    filtered.slice(0, 5).forEach((entry, i) => {
        const tr = document.createElement('tr');
        let rank = `#${i+1}`;
        if(i===0) rank = "🥇";
        if(i===1) rank = "🥈";
        if(i===2) rank = "🥉";

        // Show score and date
        tr.innerHTML = `<td>${rank}</td><td>${entry.name}</td><td style="font-weight:bold;">${entry.score}</td><td style="font-size:0.8rem; color: var(--text-secondary);">${entry.date}</td>`;
        tbody.appendChild(tr);
    });
}

function shuffle(array) {
    return array.sort(() => Math.random() - 0.5);
}
