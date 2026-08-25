import { initDB, getAll, get, put, putAll } from './db.js';
import { CATEGORIES, NECK_EXERCISES, checkAndSeedDB } from './seed.js';

// --- State ---
let currentView = 'view-dashboard';
let exercisesMap = {};
let templatesList = [];
let workoutLogs = [];

let currentWorkoutForm = {
    kind: 'pt', // pt, neck, other
    entries: [],
    notes: ''
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    await initDB();
    await checkAndSeedDB();
    await loadData();
    
    setupNavigation();
    setupEventListeners();
    
    renderDashboard();
    renderTemplates();
    renderNeckRoutine();
    renderHistory();
});

async function loadData() {
    const exList = await getAll('exercises');
    exList.forEach(ex => exercisesMap[ex.id] = ex);
    
    templatesList = await getAll('templates');
    workoutLogs = await getAll('workout_logs');
    // Sort logs descending by date
    workoutLogs.sort((a, b) => b.date - a.date);
}

// --- Navigation ---
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetId = item.getAttribute('data-target');
            if (targetId) switchView(targetId);
            
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
        });
    });
}

function switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    
    // Refresh logic if needed
    if (viewId === 'view-dashboard') renderDashboard();
    if (viewId === 'view-history') renderHistory();
    
    currentView = viewId;
    window.scrollTo(0,0);
}

// --- Dashboard ---
function renderDashboard() {
    const now = Date.now();
    const msInDay = 24 * 60 * 60 * 1000;
    
    // Calculate last logged for each category+type
    const lastLogged = {}; // category -> { stretch: ts, load: ts }
    CATEGORIES.forEach(c => lastLogged[c] = { stretch: 0, load: 0 });
    
    let neckCountThisWeek = 0;
    const oneWeekAgo = now - (7 * msInDay);
    
    workoutLogs.forEach(log => {
        if (log.workout_kind === 'neck' && log.date > oneWeekAgo) {
            neckCountThisWeek++;
        }
        
        if (log.workout_kind !== 'pt') return;
        
        log.entries.forEach(entry => {
            const ex = exercisesMap[entry.exercise_id];
            if (!ex || !ex.categories) return;
            
            ex.categories.forEach(cat => {
                if (lastLogged[cat]) {
                    if (ex.type === 'stretch' && log.date > lastLogged[cat].stretch) {
                        lastLogged[cat].stretch = log.date;
                    } else if (ex.type === 'load' && log.date > lastLogged[cat].load) {
                        lastLogged[cat].load = log.date;
                    }
                }
            });
        });
    });
    
    // Render Matrix
    const matrixEl = document.getElementById('dashboard-matrix');
    matrixEl.innerHTML = '';
    
    let overdueCount = 0;
    
    CATEGORIES.forEach(cat => {
        const row = document.createElement('div');
        row.className = 'matrix-row';
        
        // Cat Name
        const nameCell = document.createElement('div');
        nameCell.className = 'matrix-cell category-name';
        nameCell.textContent = cat;
        row.appendChild(nameCell);
        
        // Stretch & Load cells
        ['stretch', 'load'].forEach(type => {
            const cell = document.createElement('div');
            cell.className = 'matrix-cell';
            
            const ts = lastLogged[cat][type];
            const daysAgo = ts === 0 ? Infinity : Math.floor((now - ts) / msInDay);
            
            if (daysAgo < 10) {
                cell.classList.add('status-green');
                cell.textContent = daysAgo === 0 ? 'Today' : `${daysAgo}d`;
            } else if (daysAgo <= 14) {
                cell.classList.add('status-yellow');
                cell.textContent = `${daysAgo}d`;
            } else {
                cell.classList.add('status-red');
                cell.textContent = ts === 0 ? 'Never' : `${daysAgo}d`;
                overdueCount++;
            }
            
            cell.style.cursor = 'pointer';
            cell.addEventListener('click', () => openCategoryModal(cat, type));
            
            row.appendChild(cell);
        });
        
        matrixEl.appendChild(row);
    });
    
    document.getElementById('neck-streak').textContent = `${neckCountThisWeek} / 3`;
    document.getElementById('overdue-count').textContent = overdueCount;
}

// --- Quick Log / Forms ---
function renderTemplates() {
    const listEl = document.getElementById('template-list');
    listEl.innerHTML = '';
    
    templatesList.forEach(t => {
        const el = document.createElement('div');
        el.className = 'template-item';
        el.innerHTML = `
            <div class="template-title">${t.name}</div>
            <div class="template-desc">${t.description}</div>
            <button class="btn btn-secondary btn-sm mt-2">Log this session</button>
        `;
        el.querySelector('button').addEventListener('click', () => {
            openWorkoutForm('pt', t.exercises);
        });
        listEl.appendChild(el);
    });
}

function renderNeckRoutine() {
    const listEl = document.getElementById('neck-routine-list');
    listEl.innerHTML = '';
    
    NECK_EXERCISES.forEach(eid => {
        const ex = exercisesMap[eid];
        if(!ex) return;
        const el = document.createElement('div');
        el.className = 'exercise-item';
        el.innerHTML = `
            <div class="template-title">${ex.name}</div>
            <div class="template-desc">${ex.instructions}</div>
        `;
        listEl.appendChild(el);
    });
}

function setupEventListeners() {
    document.getElementById('btn-freeform').addEventListener('click', () => openWorkoutForm('pt', []));
    document.getElementById('btn-other').addEventListener('click', () => openWorkoutForm('other', []));
    document.getElementById('btn-log-neck').addEventListener('click', () => {
        document.querySelector('.nav-item[data-target="view-log"]').click();
        openWorkoutForm('neck', NECK_EXERCISES.map(id => ({ id, defaultSets: 1, defaultReps: '' })));
    });
    
    document.getElementById('btn-back-log').addEventListener('click', closeWorkoutForm);
    document.getElementById('btn-save-workout').addEventListener('click', saveWorkout);
    
    document.getElementById('btn-add-exercise').addEventListener('click', () => {
        const sel = document.getElementById('exercise-select');
        if (sel.value) {
            addExerciseToForm(sel.value, 3, '');
        }
    });

    document.getElementById('workout-date-select').addEventListener('change', (e) => {
        if (e.target.value === 'other') {
            document.getElementById('workout-date-custom').classList.remove('hidden');
        } else {
            document.getElementById('workout-date-custom').classList.add('hidden');
        }
    });

    document.getElementById('btn-close-exercise-modal').addEventListener('click', () => {
        document.getElementById('exercise-modal').classList.add('hidden');
    });

    document.getElementById('btn-close-category-modal').addEventListener('click', () => {
        document.getElementById('category-modal').classList.add('hidden');
    });
    
    document.getElementById('btn-save-new-ex').addEventListener('click', async () => {
        const nameInput = document.getElementById('new-ex-name');
        const name = nameInput.value.trim();
        if (!name) return;
        
        const cat = document.getElementById('category-modal').getAttribute('data-cat');
        const type = document.getElementById('category-modal').getAttribute('data-type');
        
        const newEx = {
            id: 'e_' + Date.now(),
            name: name,
            categories: [cat],
            type: type,
            instructions: ''
        };
        
        await put('exercises', newEx);
        exercisesMap[newEx.id] = newEx;
        nameInput.value = '';
        
        // Re-render the modal list
        openCategoryModal(cat, type);
        showToast('Exercise added!');
    });
    
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            renderHistory(e.target.getAttribute('data-filter'));
        });
    });
}

function openCategoryModal(cat, type) {
    const modal = document.getElementById('category-modal');
    modal.setAttribute('data-cat', cat);
    modal.setAttribute('data-type', type);
    
    document.getElementById('category-modal-title').textContent = `${cat} (${type === 'stretch' ? 'Stretch' : 'Load'})`;
    
    const listEl = document.getElementById('category-modal-list');
    listEl.innerHTML = '';
    
    // Find matching exercises
    const matches = Object.values(exercisesMap).filter(ex => 
        ex.categories && ex.categories.includes(cat) && ex.type === type
    );
    
    if (matches.length === 0) {
        listEl.innerHTML = '<p class="text-muted">No exercises found.</p>';
    } else {
        matches.forEach(ex => {
            const exEl = document.createElement('div');
            exEl.className = 'exercise-item';
            exEl.innerHTML = `
                <div class="template-title">${ex.name}</div>
                <button class="btn btn-secondary btn-sm mt-2 w-100">Log this</button>
            `;
            exEl.querySelector('button').addEventListener('click', () => {
                modal.classList.add('hidden');
                document.querySelector('.nav-item[data-target="view-log"]').click();
                openWorkoutForm('pt', [{ id: ex.id, defaultSets: 3, defaultReps: '' }]);
            });
            listEl.appendChild(exEl);
        });
    }
    
    modal.classList.remove('hidden');
}

function openWorkoutForm(kind, initialExercises = []) {
    currentWorkoutForm.kind = kind;
    currentWorkoutForm.entries = [];
    currentWorkoutForm.notes = '';
    
    document.getElementById('log-selection').classList.add('hidden');
    document.getElementById('workout-form-container').classList.remove('hidden');
    document.getElementById('workout-notes').value = '';
    document.getElementById('workout-form-exercises').innerHTML = '';
    
    // Reset date selection
    document.getElementById('workout-date-select').value = 'today';
    document.getElementById('workout-date-custom').classList.add('hidden');
    const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
    document.getElementById('workout-date-custom').value = todayStr;
    
    let title = "Log Session";
    if (kind === 'neck') title = "Neck Routine";
    if (kind === 'other') title = "Other Workout";
    document.getElementById('workout-form-title').textContent = title;
    
    // Populate select
    const select = document.getElementById('exercise-select');
    select.innerHTML = '<option value="">-- Select Exercise --</option>';
    
    const targetMuscleGroups = ["Chest", "Shoulders", "Biceps", "Triceps", "Quads", "Glutes", "Hamstrings"];
    let allExercises = Object.values(exercisesMap);
    
    let placeholders = allExercises.filter(ex => targetMuscleGroups.includes(ex.name));
    let others = allExercises.filter(ex => !targetMuscleGroups.includes(ex.name));
    
    placeholders.sort((a, b) => targetMuscleGroups.indexOf(a.name) - targetMuscleGroups.indexOf(b.name));
    others.sort((a, b) => a.name.localeCompare(b.name));
    
    const sortedExercises = [...placeholders, ...others];
    
    sortedExercises.forEach(ex => {
        const opt = document.createElement('option');
        opt.value = ex.id;
        opt.textContent = ex.name;
        select.appendChild(opt);
    });
    
    if (kind === 'neck') {
        document.getElementById('add-exercise-group').classList.add('hidden');
    } else {
        document.getElementById('add-exercise-group').classList.remove('hidden');
    }
    
    initialExercises.forEach(exObj => {
        addExerciseToForm(exObj.id, exObj.defaultSets || 3, exObj.defaultReps || '');
    });
}

function closeWorkoutForm() {
    document.getElementById('workout-form-container').classList.add('hidden');
    document.getElementById('log-selection').classList.remove('hidden');
}

function addExerciseToForm(exerciseId, defaultSets, defaultReps) {
    const ex = exercisesMap[exerciseId];
    if (!ex) return;
    
    const entryId = 'entry_' + Date.now() + Math.random().toString(36).substr(2, 5);
    currentWorkoutForm.entries.push({
        entryId,
        exercise_id: exerciseId,
        sets: defaultSets,
        reps: defaultReps,
        weight: '',
        exercise_notes: ''
    });
    
    renderWorkoutFormExercises();
}

function removeExerciseFromForm(entryId) {
    currentWorkoutForm.entries = currentWorkoutForm.entries.filter(e => e.entryId !== entryId);
    renderWorkoutFormExercises();
}

function renderWorkoutFormExercises() {
    const container = document.getElementById('workout-form-exercises');
    container.innerHTML = '';
    
    currentWorkoutForm.entries.forEach(entry => {
        const ex = exercisesMap[entry.exercise_id];
        const el = document.createElement('div');
        el.className = 'form-exercise';
        
        el.innerHTML = `
            <div class="form-exercise-header">
                <span class="form-exercise-title">${ex.name}</span>
                <button class="remove-btn" data-id="${entry.entryId}">&times;</button>
            </div>
            <div class="form-exercise-inputs">
                <input type="text" placeholder="Sets" value="${entry.sets}" data-field="sets" data-id="${entry.entryId}">
                <input type="text" placeholder="Reps/Time" value="${entry.reps}" data-field="reps" data-id="${entry.entryId}">
                <input type="text" placeholder="Weight/Band" value="${entry.weight}" data-field="weight" data-id="${entry.entryId}" style="grid-column: span 2;">
                <input type="text" placeholder="Exercise Details (e.g. Bench Press)" value="${entry.exercise_notes || ''}" data-field="exercise_notes" data-id="${entry.entryId}" style="grid-column: span 2;">
            </div>
        `;
        
        el.querySelector('.remove-btn').addEventListener('click', () => removeExerciseFromForm(entry.entryId));
        
        el.querySelectorAll('input').forEach(inp => {
            inp.addEventListener('input', (e) => {
                const id = e.target.getAttribute('data-id');
                const field = e.target.getAttribute('data-field');
                const ent = currentWorkoutForm.entries.find(x => x.entryId === id);
                if (ent) ent[field] = e.target.value;
            });
        });
        
        container.appendChild(el);
    });
}

async function saveWorkout() {
    if (currentWorkoutForm.entries.length === 0 && currentWorkoutForm.kind !== 'other') {
        showToast('Please add at least one exercise.');
        return;
    }
    
    const notes = document.getElementById('workout-notes').value;
    
    let workoutTimestamp = Date.now();
    const dateSelect = document.getElementById('workout-date-select').value;
    
    if (dateSelect === 'yesterday') {
        workoutTimestamp -= 24 * 60 * 60 * 1000;
    } else if (dateSelect === 'other') {
        const customDate = document.getElementById('workout-date-custom').value;
        if (customDate) {
            const [y, m, d] = customDate.split('-');
            workoutTimestamp = new Date(y, m - 1, d, 12, 0, 0).getTime();
        }
    }
    
    const log = {
        id: 'log_' + Date.now(),
        date: workoutTimestamp,
        workout_kind: currentWorkoutForm.kind,
        entries: currentWorkoutForm.entries,
        notes: notes
    };
    
    await put('workout_logs', log);
    workoutLogs.push(log);
    workoutLogs.sort((a, b) => b.date - a.date); // Resort after inserting in case of past dates
    
    showToast('Workout saved!');
    closeWorkoutForm();
    
    // Nav back to dashboard
    document.querySelector('.nav-item[data-target="view-dashboard"]').click();
}

// --- History ---
function renderHistory(filter = 'all') {
    const listEl = document.getElementById('history-list');
    listEl.innerHTML = '';
    
    // Muscle Group Tracker Logic
    const targetMuscleGroups = ["Chest", "Shoulders", "Biceps", "Triceps", "Quads", "Glutes", "Hamstrings"];
    const lastLogged = {};
    targetMuscleGroups.forEach(m => lastLogged[m] = 0);
    
    workoutLogs.forEach(log => {
        log.entries.forEach(entry => {
            const ex = exercisesMap[entry.exercise_id];
            if (ex && targetMuscleGroups.includes(ex.name)) {
                if (log.date > lastLogged[ex.name]) {
                    lastLogged[ex.name] = log.date;
                }
            }
        });
    });
    
    const trackerEl = document.getElementById('muscle-group-tracker');
    if (trackerEl) {
        trackerEl.innerHTML = '';
        const now = Date.now();
        const msInDay = 24 * 60 * 60 * 1000;
        
        targetMuscleGroups.forEach(m => {
            const ts = lastLogged[m];
            const daysAgo = ts === 0 ? Infinity : Math.floor((now - ts) / msInDay);
            
            const card = document.createElement('div');
            card.className = 'muscle-card';
            if (daysAgo < 7) card.classList.add('status-green');
            else if (daysAgo <= 10) card.classList.add('status-yellow');
            else card.classList.add('status-red');
            
            card.innerHTML = `
                <div class="muscle-name">${m}</div>
                <div class="muscle-days">${ts === 0 ? '-' : daysAgo + 'd'}</div>
            `;
            trackerEl.appendChild(card);
        });
    }

    const filtered = workoutLogs.filter(log => filter === 'all' || log.workout_kind === filter);
    
    if (filtered.length === 0) {
        listEl.innerHTML = '<p class="text-muted">No workouts found.</p>';
        return;
    }
    
    filtered.forEach(log => {
        const el = document.createElement('div');
        el.className = 'log-item';
        
        const dateStr = new Date(log.date).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        
        let title = "Workout Session";
        if (log.workout_kind === 'neck') title = "Neck Routine";
        if (log.workout_kind === 'other') title = "Other Workout";
        
        let entriesHtml = log.entries.map(ent => {
            const ex = exercisesMap[ent.exercise_id];
            let details = `<li>${ex ? ex.name : 'Unknown'} - ${ent.sets} sets x ${ent.reps} ${ent.weight ? '('+ent.weight+')' : ''}`;
            if (ent.exercise_notes) {
                details += `<br><span style="color:var(--text-secondary);font-size:12px;margin-left:8px;">↳ ${ent.exercise_notes}</span>`;
            }
            details += `</li>`;
            return details;
        }).join('');
        
        el.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
                <span class="template-title">${title}</span>
                <span class="text-muted" style="font-size:12px;">${dateStr}</span>
            </div>
            ${entriesHtml ? `<ul style="font-size:13px; margin-left:16px; margin-bottom:8px; color:var(--text-primary); list-style-type:circle;">${entriesHtml}</ul>` : ''}
            ${log.notes ? `<div style="font-size:13px; font-style:italic; border-top: 1px solid var(--border-color); padding-top:4px;">"${log.notes}"</div>` : ''}
        `;
        listEl.appendChild(el);
    });
}

// --- Utils ---
function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}
