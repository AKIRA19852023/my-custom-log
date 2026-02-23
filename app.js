// --- UUID Fallback ---
const uuid = () => {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
};

// --- State Management ---
let db = {
    categories: [],
    fields: [],
    entries: []
};

const STORAGE_KEY = 'custom_log_app_data';

function loadData() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        db = JSON.parse(saved);
        // Ensure arrays exist
        if (!db.categories) db.categories = [];
        if (!db.fields) db.fields = [];
        if (!db.entries) db.entries = [];
    } else {
        initDefaultData();
    }
    upgradeExistingData();
}

function upgradeExistingData() {
    let changed = false;
    db.categories.forEach(cat => {
        const fields = db.fields.filter(f => f.categoryId === cat.id);

        // 旧Googleマップフィールド(urlタイプ)を探す
        const oldMapField = fields.find(f => f.key === 'map_url' && f.type === 'url');
        const hasLocationField = fields.some(f => f.type === 'location');

        if (oldMapField && !hasLocationField) {
            // map_urlをlocationタイプにアップグレード
            oldMapField.type = 'location';
            oldMapField.label = '場所/地図URL';
            oldMapField.key = 'location';

            // 既存の全記録のデータを移行
            db.entries.forEach(entry => {
                if (entry.categoryId === cat.id && entry.values.map_url) {
                    entry.values.location = entry.values.map_url;
                    delete entry.values.map_url;
                }
            });
            changed = true;
        } else if (!hasLocationField) {
            // 位置情報フィールドが全くない場合に追加
            const order = fields.length + 1;
            db.fields.push({
                id: uuid(),
                categoryId: cat.id,
                key: 'location',
                label: '場所/地図URL',
                type: 'location',
                required: false,
                showInList: true,
                order
            });
            changed = true;
        }

        // --- 写真フィールドのアップグレード ---
        const oldPhotoUrlField = fields.find(f => (f.key === 'image_url' || f.key === 'photo_url') && f.type === 'url');
        const hasImageField = fields.some(f => f.type === 'image');

        if (oldPhotoUrlField && !hasImageField) {
            oldPhotoUrlField.type = 'image';
            oldPhotoUrlField.label = '写真';
            oldPhotoUrlField.key = 'photo';
            changed = true;
        } else if (!hasImageField) {
            const order = fields.length + 1;
            db.fields.push({
                id: uuid(),
                categoryId: cat.id,
                key: 'photo',
                label: '写真',
                type: 'image',
                required: false,
                showInList: true,
                order
            });
            changed = true;
        }
    });

    if (changed) {
        saveData();
    }
}

function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function initDefaultData() {
    const catRamen = { id: uuid(), name: 'ラーメン' };
    const catSake = { id: uuid(), name: '日本酒' };
    db.categories = [catRamen, catSake];

    db.fields = [
        // Ramen Fields
        { id: uuid(), categoryId: catRamen.id, key: 'shop_name', label: '店名', type: 'text', required: true, showInList: true, order: 1 },
        { id: uuid(), categoryId: catRamen.id, key: 'type', label: '種類', type: 'select', options: '醤油,味噌,塩,豚骨,家系,二郎系', required: true, showInList: true, order: 2 },
        { id: uuid(), categoryId: catRamen.id, key: 'rating', label: '評価', type: 'rating', required: false, showInList: true, order: 3 },
        { id: uuid(), categoryId: catRamen.id, key: 'date', label: '日付', type: 'date', required: true, showInList: false, order: 4 },
        { id: uuid(), categoryId: catRamen.id, key: 'photo', label: '写真', type: 'image', required: false, showInList: true, order: 5 },
        { id: uuid(), categoryId: catRamen.id, key: 'location', label: '場所/地図URL', type: 'location', required: false, showInList: true, order: 6 },

        // Sake Fields
        { id: uuid(), categoryId: catSake.id, key: 'brand', label: '銘柄', type: 'text', required: true, showInList: true, order: 1 },
        { id: uuid(), categoryId: catSake.id, key: 'prefecture', label: '産地', type: 'text', required: false, showInList: true, order: 2 },
        { id: uuid(), categoryId: catSake.id, key: 'rating', label: '評価', type: 'rating', required: false, showInList: true, order: 3 },
        { id: uuid(), categoryId: catSake.id, key: 'date', label: '日付', type: 'date', required: true, showInList: false, order: 4 },
        { id: uuid(), categoryId: catSake.id, key: 'photo', label: '写真', type: 'image', required: false, showInList: true, order: 5 },
        { id: uuid(), categoryId: catSake.id, key: 'location', label: '場所/地図URL', type: 'location', required: false, showInList: true, order: 6 }
    ];
    saveData();
}

// --- UI Interaction ---
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    initTabs();
    renderCategoryFilter();
    renderEntries();
    renderSettingsCategories();
    setupEventListeners();

    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(err => console.log('SW registration failed', err));
    }
});

function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`${btn.dataset.tab}-tab`).classList.add('active');

            // Refresh views if needed
            if (btn.dataset.tab === 'record') renderEntries();
            if (btn.dataset.tab === 'settings') renderSettingsCategories();
        });
    });
}

function setupEventListeners() {
    // Record Tab
    document.getElementById('category-filter').addEventListener('change', renderEntries);
    document.getElementById('search-input').addEventListener('input', renderEntries);
    document.getElementById('sort-select').addEventListener('change', renderEntries);
    document.getElementById('add-entry-btn').addEventListener('click', () => showEntryModal());
    document.getElementById('close-entry-modal').addEventListener('click', () => {
        document.getElementById('entry-modal').style.display = 'none';
    });

    // Settings Tab - Categories
    document.getElementById('add-category-btn').addEventListener('click', addCategory);

    // Settings Tab - Fields
    document.getElementById('field-type').addEventListener('change', (e) => {
        document.getElementById('options-row').style.display = e.target.value === 'select' ? 'block' : 'none';
    });
    document.getElementById('save-field-btn').addEventListener('click', saveField);
    document.getElementById('cancel-field-btn').addEventListener('click', resetFieldForm);

    // Dynamic Entry Form Image Handling
    document.getElementById('dynamic-entry-form').addEventListener('change', (e) => {
        if (e.target.type === 'file' && e.target.accept.includes('image')) {
            handleImageUpload(e.target);
        }
    });

    // IO Tab
    document.getElementById('export-json-btn').addEventListener('click', exportJSON);
    document.getElementById('import-json-btn').addEventListener('click', importJSON);
}

// --- Category Logic ---
function renderCategoryFilter() {
    const filter = document.getElementById('category-filter');
    const currentVal = filter.value;
    filter.innerHTML = db.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    if (currentVal && db.categories.find(c => c.id === currentVal)) {
        filter.value = currentVal;
    }
}

function renderSettingsCategories() {
    const list = document.getElementById('category-list');
    list.innerHTML = db.categories.map(c => `
        <li class="manage-item" data-id="${c.id}">
            <span>${c.name}</span>
            <div class="actions">
                <button class="small-btn edit-cat">改名</button>
                <button class="small-btn delete-cat">削除</button>
            </div>
        </li>
    `).join('');

    list.querySelectorAll('.manage-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            selectCategoryForSettings(item.dataset.id);
        });
        item.querySelector('.edit-cat').addEventListener('click', () => editCategory(item.dataset.id));
        item.querySelector('.delete-cat').addEventListener('click', () => deleteCategory(item.dataset.id));
    });
}

function addCategory() {
    const name = document.getElementById('new-category-name').value.trim();
    if (!name) return;
    const newCat = { id: uuid(), name };
    db.categories.push(newCat);
    document.getElementById('new-category-name').value = '';
    saveData();
    renderCategoryFilter();
    renderSettingsCategories();
}

function editCategory(id) {
    const cat = db.categories.find(c => c.id === id);
    const newName = prompt('カテゴリ名を変更:', cat.name);
    if (newName && newName.trim()) {
        cat.name = newName.trim();
        saveData();
        renderCategoryFilter();
        renderSettingsCategories();
    }
}

function deleteCategory(id) {
    if (!confirm('このカテゴリを削除しますか？紐づくフィールドと記録もすべて削除されます。')) return;
    db.categories = db.categories.filter(c => c.id !== id);
    db.fields = db.fields.filter(f => f.categoryId !== id);
    db.entries = db.entries.filter(e => e.categoryId !== id);
    saveData();
    renderCategoryFilter();
    renderSettingsCategories();
    document.getElementById('field-manager-section').style.display = 'none';
    renderEntries();
}

// --- Field Logic ---
let activeCategoryId = null;

function selectCategoryForSettings(id) {
    activeCategoryId = id;
    const cat = db.categories.find(c => c.id === id);
    document.getElementById('target-category-name').textContent = cat.name;
    document.getElementById('field-manager-section').style.display = 'block';

    document.querySelectorAll('.manage-item').forEach(el => el.classList.remove('selected'));
    document.querySelector(`.manage-item[data-id="${id}"]`).classList.add('selected');

    renderFields();
    resetFieldForm();
}

function renderFields() {
    const list = document.getElementById('field-list');
    const fields = db.fields.filter(f => f.categoryId === activeCategoryId).sort((a, b) => a.order - b.order);
    list.innerHTML = fields.map(f => `
        <li class="manage-item">
            <span>${f.label} (${f.type})</span>
            <div class="actions">
                <button class="small-btn" onclick="editField('${f.id}')">編集</button>
                <button class="small-btn" onclick="deleteField('${f.id}')">削除</button>
            </div>
        </li>
    `).join('');
}

function saveField() {
    const id = document.getElementById('edit-field-id').value;
    const label = document.getElementById('field-label').value.trim();
    const key = document.getElementById('field-key').value.trim();
    const type = document.getElementById('field-type').value;
    const required = document.getElementById('field-required').checked;
    const showInList = document.getElementById('field-show-in-list').checked;
    const options = document.getElementById('field-options').value;

    if (!label || !key) return alert('ラベルとキーは必須です');

    if (id) {
        const idx = db.fields.findIndex(f => f.id === id);
        db.fields[idx] = { ...db.fields[idx], label, key, type, required, showInList, options };
    } else {
        const order = db.fields.filter(f => f.categoryId === activeCategoryId).length + 1;
        db.fields.push({ id: uuid(), categoryId: activeCategoryId, label, key, type, required, showInList, options, order });
    }

    saveData();
    renderFields();
    resetFieldForm();
}

window.editField = (id) => {
    const f = db.fields.find(f => f.id === id);
    document.getElementById('edit-field-id').value = f.id;
    document.getElementById('field-label').value = f.label;
    document.getElementById('field-key').value = f.key;
    document.getElementById('field-type').value = f.type;
    document.getElementById('field-required').checked = f.required;
    document.getElementById('field-show-in-list').checked = f.showInList;
    document.getElementById('field-options').value = f.options || '';
    document.getElementById('options-row').style.display = f.type === 'select' ? 'block' : 'none';
};

window.deleteField = (id) => {
    if (!confirm('この項目を削除しますか？既存の記録のこの値は失われます。')) return;
    db.fields = db.fields.filter(f => f.id !== id);
    saveData();
    renderFields();
};

function resetFieldForm() {
    document.getElementById('edit-field-id').value = '';
    document.getElementById('field-label').value = '';
    document.getElementById('field-key').value = '';
    document.getElementById('field-type').value = 'text';
    document.getElementById('field-required').checked = false;
    document.getElementById('field-show-in-list').checked = false;
    document.getElementById('field-options').value = '';
    document.getElementById('options-row').style.display = 'none';
}

// --- Entry Logic ---
function showEntryModal(entryId = null) {
    const catId = document.getElementById('category-filter').value;
    if (!catId) return alert('カテゴリを選択してください');

    activeCategoryId = catId;
    const cat = db.categories.find(c => c.id === catId);
    const fields = db.fields.filter(f => f.categoryId === catId).sort((a, b) => a.order - b.order);

    const container = document.getElementById('dynamic-fields-container');
    container.innerHTML = '';

    const entry = entryId ? db.entries.find(e => e.id === entryId) : null;
    document.getElementById('entry-id').value = entryId || '';
    document.getElementById('entry-category-id').value = catId;
    document.getElementById('entry-modal-title').textContent = entryId ? '記録を編集' : `${cat.name}を記録`;

    fields.forEach(f => {
        const val = entry ? entry.values[f.key] : '';
        const fieldWrap = document.createElement('div');
        fieldWrap.className = 'form-row';

        let inputHtml = '';
        if (f.type === 'textarea') {
            inputHtml = `<textarea name="${f.key}" ${f.required ? 'required' : ''}>${val || ''}</textarea>`;
        } else if (f.type === 'select') {
            const opts = (f.options || '').split(',').map(o => o.trim());
            inputHtml = `
                <select name="${f.key}" ${f.required ? 'required' : ''}>
                    <option value="">選択してください</option>
                    ${opts.map(o => `<option value="${o}" ${val === o ? 'selected' : ''}>${o}</option>`).join('')}
                </select>
            `;
        } else if (f.type === 'rating') {
            inputHtml = `
                <input type="number" name="${f.key}" min="1" max="5" value="${val || 3}" ${f.required ? 'required' : ''}>
                <span class="hint">(1-5)</span>
            `;
        } else if (f.type === 'image') {
            inputHtml = `
                <div class="image-input-container" onclick="document.getElementById('file-${f.id}').click()" style="border: 2px dashed #ccc; border-radius: 8px; padding: 20px; text-align: center; cursor: pointer; background: #f9f9f9;">
                    <input type="file" accept="image/*" data-key="${f.key}" id="file-${f.id}" style="display:none">
                    <input type="hidden" name="${f.key}" id="hidden-${f.key}" value="${val || ''}">
                    <div id="preview-${f.key}" class="image-preview">
                        ${val ? `<img src="${val}" style="max-width:100%; border-radius:8px;">` : `
                            <div style="color: #666;">
                                <div style="font-size: 2rem; margin-bottom: 5px;">📸</div>
                                <div>タップして写真を選択</div>
                                <small>(アルバムまたはカメラ)</small>
                            </div>
                        `}
                    </div>
                </div>
            `;
        } else if (f.type === 'location') {
            const fieldId = `loc-${f.id.replace(/[^a-zA-Z0-9]/g, '')}`;
            inputHtml = `
                <div style="display:flex;flex-direction:column;gap:0.3rem;width:100%;">
                    <div style="display:flex;gap:0.5rem;width:100%;">
                        <input type="text" name="${f.key}" id="${fieldId}" value="${val || ''}" placeholder="緯度,経度 または GoogleマップURL" ${f.required ? 'required' : ''} onchange="handleLocationInput('${fieldId}')">
                        <button type="button" class="small-btn" onclick="getCurrentLocation('${fieldId}')">取得</button>
                        <button type="button" class="small-btn" onclick="clearLocation('${fieldId}')">消去</button>
                    </div>
                    <small style="color:var(--text-light);font-size:0.75rem;">URLを貼ると自動で座標に変換します</small>
                </div>
            `;
        } else {
            inputHtml = `<input type="${f.type}" name="${f.key}" value="${val || ''}" ${f.required ? 'required' : ''}>`;
        }

        fieldWrap.innerHTML = `
            <label>
                ${f.label} ${f.required ? '<span style="color:red">*</span>' : ''}
                ${inputHtml}
            </label>
        `;
        container.appendChild(fieldWrap);
    });

    document.getElementById('entry-modal').style.display = 'block';
}

window.getCurrentLocation = (inputId) => {
    const input = document.getElementById(inputId);
    if (!navigator.geolocation) {
        alert('お使いのブラウザは位置情報サービスに対応していません。');
        return;
    }

    input.placeholder = '取得中...';
    const originalValue = input.value;

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            input.value = `${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`;
            input.placeholder = '緯度,経度 または GoogleマップURL';
        },
        (err) => {
            console.error('Geolocation Error:', err);
            let msg = '位置情報の取得に失敗しました。';
            switch (err.code) {
                case err.PERMISSION_DENIED:
                    msg += '\n位置情報の利用が許可されていません。ブラウザの設定を確認してください。';
                    break;
                case err.POSITION_UNAVAILABLE:
                    msg += '\n位置情報を特定できませんでした。電波状況の良い場所で再度お試しください。';
                    break;
                case err.TIMEOUT:
                    msg += '\n取得がタイムアウトしました。再度お試しください。';
                    break;
                default:
                    msg += '\n不明なエラーが発生しました。';
                    break;
            }
            alert(msg);
            input.placeholder = '緯度,経度 または GoogleマップURL';
            input.value = originalValue;
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
};

window.handleLocationInput = (inputId) => {
    const input = document.getElementById(inputId);
    const val = input.value.trim();
    if (!val) return;

    // URLから座標を抽出するロジック (Google Maps等のURLに対応)
    // パターン1: ...@35.681236,139.767125...
    const atMatch = val.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch) {
        input.value = `${atMatch[1]},${atMatch[2]}`;
        return;
    }

    // パターン2: query=35.681236,139.767125
    const queryMatch = val.match(/query=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (queryMatch) {
        input.value = `${queryMatch[1]},${queryMatch[2]}`;
        return;
    }

    // パターン3: 単純な座標貼り付け (35.681236, 139.767125)
    const latLngMatch = val.match(/^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/);
    if (latLngMatch) {
        input.value = `${latLngMatch[1]},${latLngMatch[2]}`;
        return;
    }
};

window.clearLocation = (inputId) => {
    document.getElementById(inputId).value = '';
};

document.getElementById('dynamic-entry-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const values = {};
    formData.forEach((val, key) => {
        values[key] = val;
    });

    const id = document.getElementById('entry-id').value;
    const catId = document.getElementById('entry-category-id').value;

    if (id) {
        const idx = db.entries.findIndex(entry => entry.id === id);
        db.entries[idx] = { ...db.entries[idx], values };
    } else {
        db.entries.push({
            id: uuid(),
            categoryId: catId,
            createdAt: new Date().toISOString(),
            values
        });
    }

    saveData();
    document.getElementById('entry-modal').style.display = 'none';
    renderEntries();
});

function renderEntries() {
    const catId = document.getElementById('category-filter').value;
    const query = document.getElementById('search-input').value.toLowerCase();
    const sort = document.getElementById('sort-select').value;

    let entries = db.entries.filter(e => e.categoryId === catId);
    const fields = db.fields.filter(f => f.categoryId === catId).sort((a, b) => a.order - b.order);
    const showInListFields = fields.filter(f => f.showInList);

    // Filter by search
    if (query) {
        entries = entries.filter(e => {
            return Object.values(e.values).some(v => String(v).toLowerCase().includes(query));
        });
    }

    // Sort
    entries.sort((a, b) => {
        // Use 'date' field if it exists, else 'createdAt'
        const aDate = a.values.date || a.createdAt;
        const bDate = b.values.date || b.createdAt;
        return sort === 'newest' ? (bDate > aDate ? 1 : -1) : (aDate > bDate ? 1 : -1);
    });

    const container = document.getElementById('entries-view');
    if (entries.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:var(--text-light);margin-top:2rem;">記録が見つかりません</p>';
        return;
    }

    container.innerHTML = entries.map(e => {
        const mainVal = entries.length > 0 ? (e.values[fields[0]?.key] || '無題') : '無題';
        const dateStr = new Date(e.values.date || e.createdAt).toLocaleDateString('ja-JP');

        return `
            <div class="entry-card">
                <div class="entry-header">
                    <span>${dateStr}</span>
                    <span class="category-badge">${db.categories.find(c => c.id === e.categoryId)?.name}</span>
                </div>
                <div class="entry-main-val">${mainVal}</div>
                <div class="entry-fields">
                    ${showInListFields.slice(1).map(f => {
            const val = e.values[f.key];
            if (!val) return '';
            return `
                        <div class="entry-field">
                            <span class="label">${f.label}:</span>
                            <span class="value">${renderFieldValue(f, val)}</span>
                        </div>`;
        }).join('')}
                </div>
                <div class="entry-actions">
                    <button class="small-btn" onclick="showEntryModal('${e.id}')">編集</button>
                    <button class="small-btn" onclick="deleteEntry('${e.id}')">削除</button>
                </div>
            </div>
        `;
    }).join('');
}

function renderFieldValue(field, val) {
    if (!val) return '-';
    if (field.type === 'image') {
        return `<img src="${val}" style="max-width:100px;max-height:100px;border-radius:4px;cursor:pointer;" onclick="window.open('${val}')">`;
    }
    if (field.type === 'rating') {
        return `<span class="rating-stars">${'★'.repeat(val)}${'☆'.repeat(5 - val)}</span>`;
    }
    if (field.type === 'url') {
        const isMap = val.includes('google.com/maps') || val.includes('goo.gl/maps');
        return `<a href="${val}" target="_blank" rel="noopener">${isMap ? 'マップを開く' : 'リンクを開く'}</a>`;
    }
    if (field.type === 'location') {
        return `<a href="https://www.google.com/maps/search/?api=1&query=${val}" target="_blank" rel="noopener">地図</a>`;
    }
    return val;
}

async function handleImageUpload(input) {
    const file = input.files[0];
    if (!file) return;

    const key = input.dataset.key;
    const preview = document.getElementById(`preview-${key}`);
    const hidden = document.getElementById(`hidden-${key}`);

    preview.innerHTML = '<small>処理中...</small>';

    try {
        const base64 = await resizeAndConvertImage(file);
        hidden.value = base64;
        preview.innerHTML = `<img src="${base64}" style="max-width:100%;border-radius:8px;margin-top:5px;">`;
    } catch (err) {
        alert('画像の読み込みに失敗しました');
        preview.innerHTML = '<small>選択に失敗しました</small>';
    }
}

function resizeAndConvertImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800;
                let width = img.width;
                let height = img.height;

                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.7)); // 品質0.7で保存
            };
        };
        reader.onerror = reject;
    });
}

window.deleteEntry = (id) => {
    if (!confirm('この記録を削除しますか？')) return;
    db.entries = db.entries.filter(e => e.id !== id);
    saveData();
    renderEntries();
};

// --- IO Logic ---
function exportJSON() {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `custom-log-dump-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function importJSON() {
    const file = document.getElementById('import-file').files[0];
    if (!file) return alert('ファイルを選択してください');

    const mode = document.querySelector('input[name="import-mode"]:checked').value;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const imported = JSON.parse(e.target.result);
            if (mode === 'overwrite') {
                db = imported;
            } else {
                // Merge logic: Add IDs that don't exist
                imported.categories.forEach(c => {
                    if (!db.categories.find(dc => dc.id === c.id)) db.categories.push(c);
                });
                imported.fields.forEach(f => {
                    if (!db.fields.find(df => df.id === f.id)) db.fields.push(f);
                });
                imported.entries.forEach(en => {
                    if (!db.entries.find(den => den.id === en.id)) db.entries.push(en);
                });
            }
            saveData();
            location.reload();
        } catch (err) {
            alert('JSONのパースに失敗しました');
        }
    };
    reader.readAsText(file);
}
