/**
 * Inline CSV editor rendering a content editable table backed by a textarea to
 * preserve compatibility with copy/paste workflows.
 */

const CSV_FIELDS = [
    { key: 'question', label: 'Question', header: 'question_content' },
    { key: 'questionImage', label: 'Image question', header: 'question_content_image' },
    { key: 'answer', label: 'Réponse', header: 'answer_content' },
    { key: 'answerImage', label: 'Image réponse', header: 'answer_content_image' },
    { key: 'box', label: 'Boîte', header: 'box_number' },
    { key: 'lastReview', label: 'Dernière révision', header: 'last_reviewed' }
];

function escapeCsvValue(value) {
    if (value === null || value === undefined) {
        return '';
    }

    const stringValue = String(value);
    if (stringValue.includes('"') || stringValue.includes(',') || stringValue.includes(';') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
}

function parseCsvLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];

        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
        } else if ((char === ',' || char === ';') && !inQuotes) {
            values.push(current);
            current = '';
        } else {
            current += char;
        }
    }

    values.push(current);
    return values.map((value) => value.trim());
}

function formatLastReview(dateValue) {
    if (!dateValue) {
        return '';
    }

    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    return date.toISOString().split('T')[0];
}
export class CSVInlineEditor {
    /**
     * @param {Object} options - Component options.
     * @param {HTMLElement} options.container - Root container receiving the markup.
     * @param {import('../keyboardManager.js').KeyboardManager} [options.keyboardManager] - Optional shortcut manager.
     */
    constructor({ container, keyboardManager } = {}) {
        this.container = container;
        this.keyboardManager = keyboardManager || null;
        this.data = [];
        this.previewCache = new Map();

        this.handleTableInput = this.handleTableInput.bind(this);
        this.handleAddRow = this.handleAddRow.bind(this);
        this.handleExport = this.handleExport.bind(this);
        this.handleImport = this.handleImport.bind(this);
    }

    /**
     * Render initial DOM structure.
     *
     * @returns {void}
     */
    init() {
        if (!this.container) {
            console.warn('CSVInlineEditor requires a container element.');
            return;
        }

        this.container.classList.add('csv-inline-editor');
        this.container.innerHTML = `
            <div class="csv-inline-editor__header">
                <h2 class="csv-inline-editor__title">Éditeur CSV inline</h2>
                <p class="csv-inline-editor__description">
                    Modifiez directement les cellules ci-dessous. Les modifications sont synchronisées avec la zone CSV.
                </p>
            </div>
            <div class="csv-inline-editor__toolbar">
                <button type="button" class="csv-inline-editor__action" data-action="load">
                    Charger les cartes actuelles
                </button>
                <button type="button" class="csv-inline-editor__action" data-action="add">
                    Ajouter une ligne
                </button>
                <button type="button" class="csv-inline-editor__action" data-action="export">
                    Exporter en CSV
                </button>
                <span class="csv-inline-editor__status" aria-live="polite"></span>
            </div>
            <div class="csv-inline-editor__content" role="region" aria-label="Tableau d'édition CSV">
                <table class="csv-inline-editor__table">
                    <thead>
                        <tr>
                            ${CSV_FIELDS.map(field => `<th scope="col">${field.label}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
            <label class="csv-inline-editor__textarea-label" for="csv-inline-editor-textarea">
                Représentation brute (pour copier-coller)
            </label>
            <textarea id="csv-inline-editor-textarea" class="csv-inline-editor__textarea" rows="6"></textarea>
        `;

        this.elements = {
            tableBody: this.container.querySelector('tbody'),
            textarea: this.container.querySelector('textarea'),
            status: this.container.querySelector('.csv-inline-editor__status'),
            loadButton: this.container.querySelector('[data-action="load"]'),
            addButton: this.container.querySelector('[data-action="add"]'),
            exportButton: this.container.querySelector('[data-action="export"]')
        };

        this.elements.tableBody.addEventListener('input', this.handleTableInput);
        this.elements.loadButton.addEventListener('click', this.handleImport);
        this.elements.addButton.addEventListener('click', this.handleAddRow);
        this.elements.exportButton.addEventListener('click', this.handleExport);
        this.elements.textarea.addEventListener('input', () => this.importFromText());

        if (this.keyboardManager) {
            this.keyboardManager.registerShortcut('ctrl+e', () => this.handleExport(), {
                description: 'Exporter le CSV inline',
                element: this.elements.exportButton
            });
        }

        this.renderRows();
    }

    /**
     * Connect the editor to a Leitner app instance.
     *
     * @param {import('../../core/leitnerApp.js').LeitnerApp} app - App instance exposing flashcards.
     * @returns {void}
     */
    bindToApp(app) {
        this.app = app;
        this.loadFromApp();

        window.addEventListener('leitner:card-reviewed', () => this.loadFromApp(), { passive: true });
        window.addEventListener('leitner:session-recorded', () => this.loadFromApp(), { passive: true });
        window.addEventListener('leitner:cards-updated', () => this.loadFromApp(), { passive: true });
    }

    /**
     * Load flashcards from the connected app.
     *
     * @returns {void}
     */
    loadFromApp() {
        if (!this.app) {
            return;
        }

        const cards = Array.isArray(this.app.flashcards) ? this.app.flashcards : [];
        this.previewCache.clear();
        this.data = cards.map(card => ({
            question: card.question || '',
            questionImage: this.normaliseImageValue(card.questionImage || '', 'questionImage'),
            answer: card.answer || '',
            answerImage: this.normaliseImageValue(card.answerImage || '', 'answerImage'),
            box: card.box || 1,
            lastReview: formatLastReview(card.lastReview)
        }));
        this.renderRows();
        this.syncTextarea();
        this.setStatus(`${this.data.length} lignes chargées depuis l'application.`);
    }

    /**
     * Import data from the textarea content.
     *
     * @returns {void}
     */
    importFromText() {
        const text = this.elements.textarea.value.trim();
        if (!text) {
            this.data = [];
            this.renderRows();
            this.setStatus('Zone CSV vide.');
            return;
        }

        const rows = text.split(/\r?\n/).filter((line) => line.trim() !== '');
        if (!rows.length) {
            this.data = [];
            this.renderRows();
            this.setStatus('Zone CSV vide.');
            return;
        }

        const headers = parseCsvLine(rows[0]);
        const hasHeaders = headers.length === CSV_FIELDS.length && CSV_FIELDS.every((field, index) => headers[index] === field.header);
        const dataRows = hasHeaders ? rows.slice(1) : rows;

        this.previewCache.clear();
        this.data = dataRows.map((row) => {
            const values = parseCsvLine(row);
            const mapped = {};
            CSV_FIELDS.forEach((field, index) => {
                const rawValue = values[index] ?? '';
                if (field.key === 'box') {
                    mapped[field.key] = Number(rawValue) || 1;
                } else if (field.key === 'questionImage' || field.key === 'answerImage') {
                    mapped[field.key] = this.normaliseImageValue(rawValue, field.key);
                } else {
                    mapped[field.key] = rawValue;
                }
            });
            return mapped;
        });

        this.renderRows();
        const importMessage = hasHeaders
            ? `${this.data.length} lignes importées (en-têtes reconnus).`
            : `${this.data.length} lignes importées sans en-têtes.`;
        this.setStatus(importMessage);
    }

    /**
     * Handle edits performed inside the table.
     *
     * @param {Event} event - Input event triggered by contentEditable cells.
     * @returns {void}
     */
    handleTableInput(event) {
        const target = event.target?.closest('[data-field]');
        if (!target?.dataset?.rowIndex || !target.dataset.field) {
            return;
        }

        const index = Number(target.dataset.rowIndex);
        if (Number.isNaN(index)) {
            return;
        }

        const field = target.dataset.field;
        const rawValue = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
            ? target.value
            : target.textContent;
        const trimmedValue = (rawValue || '').trim();

        if (field === 'box') {
            const numericValue = Number(trimmedValue) || 1;
            this.data[index][field] = numericValue;
            if (!(target instanceof HTMLInputElement)) {
                target.textContent = String(numericValue);
            }
        } else if (field === 'questionImage' || field === 'answerImage') {
            const cacheKey = this.getPreviewCacheKey(index, field);
            this.previewCache.delete(cacheKey);
            const normalised = this.normaliseImageValue(trimmedValue, field);
            this.data[index][field] = normalised;
            const cell = target.closest('td');
            if (cell) {
                this.updateImageCellUI(cell, normalised, field, index);
            }
        } else {
            this.data[index][field] = trimmedValue;
        }

        this.syncTextarea();
    }

    /**
     * Append an empty row to the dataset.
     *
     * @returns {void}
     */
    handleAddRow() {
        this.data.push({
            question: '',
            questionImage: '',
            answer: '',
            answerImage: '',
            box: 1,
            lastReview: ''
        });
        this.renderRows();
        this.syncTextarea();
        this.setStatus('Nouvelle ligne ajoutée.');
    }

    /**
     * Export the current dataset as a downloadable CSV file.
     *
     * @returns {void}
     */
    handleExport() {
        const headerLine = CSV_FIELDS.map(field => field.header).join(',');
        const contentLines = this.data.map((row) => {
            const values = CSV_FIELDS.map((field) => {
                if (field.key === 'box') {
                    return escapeCsvValue(Number(row[field.key]) || 1);
                }
                return escapeCsvValue(row[field.key] ?? '');
            });
            return values.join(',');
        });
        const content = [headerLine, ...contentLines].join('\n');
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'flashcards-inline.csv';
        anchor.click();
        URL.revokeObjectURL(url);
        this.setStatus('Export CSV généré.');
    }

    /**
     * Import flashcards from the connected application.
     *
     * @returns {void}
     */
    handleImport() {
        this.loadFromApp();
    }

    /**
     * Synchronise textarea content with the table data.
     *
     * @returns {void}
     */
    syncTextarea() {
        if (!this.elements) {
            return;
        }

        const headerLine = CSV_FIELDS.map(field => field.header).join(',');
        const dataLines = this.data.map((row) => {
            const values = CSV_FIELDS.map((field) => {
                if (field.key === 'box') {
                    return escapeCsvValue(Number(row[field.key]) || 1);
                }
                return escapeCsvValue(row[field.key] ?? '');
            });
            return values.join(',');
        });
        this.elements.textarea.value = [headerLine, ...dataLines].join('\n');
    }

    /**
     * Render table rows from the dataset.
     *
     * @returns {void}
     */
    renderRows() {
        if (!this.elements) {
            return;
        }

        const body = this.elements.tableBody;
        body.innerHTML = '';

        if (!this.data.length) {
            const emptyRow = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = CSV_FIELDS.length;
            cell.textContent = 'Aucune donnée. Ajoutez une ligne pour commencer.';
            emptyRow.appendChild(cell);
            body.appendChild(emptyRow);
            return;
        }

        const fragment = document.createDocumentFragment();
        this.data.forEach((row, index) => {
            const tr = document.createElement('tr');
            CSV_FIELDS.forEach((field) => {
                if (field.key === 'questionImage' || field.key === 'answerImage') {
                    const cell = this.createImageCell({ row, index, field });
                    tr.appendChild(cell);
                } else {
                    const td = document.createElement('td');
                    td.contentEditable = 'true';
                    td.dataset.rowIndex = String(index);
                    td.dataset.field = field.key;
                    td.className = 'csv-inline-editor__cell';
                    const value = field.key === 'box'
                        ? String(row[field.key] ?? '')
                        : row[field.key] ?? '';
                    td.textContent = value;
                    tr.appendChild(td);
                }
            });
            fragment.appendChild(tr);
        });
        body.appendChild(fragment);
    }

    /**
     * Display a status message in the toolbar.
     *
     * @param {string} message - Text to display.
     * @returns {void}
     */
    setStatus(message) {
        if (this.elements?.status) {
            this.elements.status.textContent = message;
        }
    }

    /**
     * Create an interactive cell for image fields with preview and controls.
     *
     * @private
     * @param {{ row: Object, index: number, field: { key: string, label: string } }} params
     * @returns {HTMLTableCellElement}
     */
    createImageCell({ row, index, field }) {
        const td = document.createElement('td');
        td.className = 'csv-inline-editor__cell csv-inline-editor__cell--image';
        td.dataset.rowIndex = String(index);
        td.dataset.field = field.key;

        const previewWrapper = document.createElement('div');
        previewWrapper.className = 'csv-inline-editor__image-preview';

        const preview = document.createElement('img');
        preview.className = 'csv-inline-editor__thumbnail';
        preview.alt = `${field.label} - aperçu`;
        previewWrapper.appendChild(preview);

        const controls = document.createElement('div');
        controls.className = 'csv-inline-editor__image-controls';

        const textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.className = 'csv-inline-editor__image-input';
        textInput.placeholder = 'Chemin ou URL de l\'image';
        textInput.dataset.rowIndex = String(index);
        textInput.dataset.field = field.key;

        const actions = document.createElement('div');
        actions.className = 'csv-inline-editor__image-actions';

        const importButton = document.createElement('button');
        importButton.type = 'button';
        importButton.className = 'csv-inline-editor__image-button';
        importButton.textContent = 'Importer';

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.className = 'csv-inline-editor__image-file-input';

        importButton.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', async () => {
            const file = fileInput.files?.[0];
            if (!file) {
                return;
            }

            try {
                const dataUrl = await this.readFileAsDataURL(file);
                if (!dataUrl) {
                    this.setStatus('Impossible de charger l\'image sélectionnée.');
                    return;
                }

                const relativePath = this.buildRelativeImagePath(file.name, field.key);
                const cacheKey = this.getPreviewCacheKey(index, field.key);
                this.previewCache.set(cacheKey, dataUrl);
                this.data[index][field.key] = relativePath;
                this.updateImageCellUI(td, relativePath, field.key, index);
                this.syncTextarea();
                this.setStatus(`Image importée sur la ligne ${index + 1} (${relativePath}).`);
            } catch (error) {
                console.error('Erreur lors de la lecture du fichier image', error);
                this.setStatus('Lecture du fichier image impossible.');
            } finally {
                fileInput.value = '';
            }
        });

        controls.appendChild(textInput);
        actions.appendChild(importButton);
        controls.appendChild(actions);

        td.appendChild(previewWrapper);
        td.appendChild(controls);
        td.appendChild(fileInput);

        textInput.value = row[field.key] ?? '';
        this.updateImageCellUI(td, row[field.key] ?? '', field.key, index);

        return td;
    }

    /**
     * Update the UI of an image cell (preview + input state).
     *
     * @private
     * @param {HTMLTableCellElement} cell - Cell containing image controls.
     * @param {string} value - Current value for the image field.
     * @param {string} fieldKey - Field key.
     * @returns {void}
     */
    updateImageCellUI(cell, value, fieldKey, rowIndex = null) {
        if (!cell) {
            return;
        }

        const preview = cell.querySelector('.csv-inline-editor__thumbnail');
        let overrideSrc = null;
        if (rowIndex !== null) {
            const cacheKey = this.getPreviewCacheKey(rowIndex, fieldKey);
            overrideSrc = this.previewCache.get(cacheKey) || null;
            if (!value && cacheKey) {
                this.previewCache.delete(cacheKey);
            }
        }
        this.updateImagePreviewElement(preview, value, fieldKey, overrideSrc);

        const input = cell.querySelector('.csv-inline-editor__image-input');
        if (input) {
            if (value && value.startsWith('data:')) {
                input.value = '';
                input.placeholder = 'Image intégrée (base64)';
                input.classList.add('csv-inline-editor__image-input--inline');
            } else {
                input.value = value || '';
                input.placeholder = 'Chemin ou URL de l\'image';
                input.classList.remove('csv-inline-editor__image-input--inline');
            }
        }
    }

    /**
     * Resolve the display source for an image field.
     *
     * @private
     * @param {string} value - Stored image value.
     * @param {string} fieldKey - Field key.
     * @returns {string}
     */
    getPreviewCacheKey(index, fieldKey) {
        return `${index}:${fieldKey}`;
    }

    buildRelativeImagePath(fileName, fieldKey) {
        const trimmed = (fileName || '').trim();
        if (!trimmed) {
            return '';
        }
        const imageType = this.getImageTypeForField(fieldKey);
        if (this.app?.github?.buildRelativeImagePath) {
            return this.app.github.buildRelativeImagePath(trimmed, imageType);
        }
        const safeName = trimmed
            .replace(/\s+/g, '_')
            .replace(/[^a-zA-Z0-9_.-]/g, '_');
        const directory = imageType === 'answer' ? 'images_reponses' : 'images_questions';
        return `${directory}/${safeName}`;
    }

    resolveImageSource(value, fieldKey) {
        const trimmed = (value || '').trim();
        if (!trimmed) {
            return '';
        }
        if (trimmed.startsWith('http') || trimmed.startsWith('data:')) {
            return trimmed;
        }
        if (this.app?.github) {
            const type = this.getImageTypeForField(fieldKey);
            return this.app.github.getImageUrl(trimmed, type);
        }
        return trimmed;
    }

    /**
     * Update a preview element based on value and field type.
     *
     * @private
     * @param {HTMLImageElement|null} preview - Image element to update.
     * @param {string} value - Stored image value.
     * @param {string} fieldKey - Field key.
     * @returns {void}
     */
    updateImagePreviewElement(preview, value, fieldKey, overrideSrc = null) {
        if (!preview) {
            return;
        }
        const src = overrideSrc || this.resolveImageSource(value, fieldKey);
        if (src) {
            preview.src = src;
            preview.classList.remove('csv-inline-editor__thumbnail--hidden');
        } else {
            preview.removeAttribute('src');
            preview.classList.add('csv-inline-editor__thumbnail--hidden');
        }
    }

    /**
     * Convert image values to a consistent representation.
     *
     * @private
     * @param {string} value - Raw input value.
     * @param {string} fieldKey - Field key.
     * @returns {string}
     */
    normaliseImageValue(value, fieldKey) {
        const trimmed = (value || '').trim();
        if (!trimmed) {
            return '';
        }
        if (trimmed.startsWith('data:')) {
            return '';
        }
        const type = this.getImageTypeForField(fieldKey);
        if (this.app?.github?.ensureRepositoryImagePath) {
            return this.app.github.ensureRepositoryImagePath(trimmed, type);
        }
        if (trimmed.startsWith('http') && this.app?.github) {
            return this.app.github.simplifyImagePath(trimmed, type);
        }
        const withoutPrefix = trimmed.replace(/^(\.\/|\/)/, '');
        if (withoutPrefix.startsWith('images_questions/') || withoutPrefix.startsWith('images_reponses/')) {
            return withoutPrefix;
        }
        const directory = type === 'answer' ? 'images_reponses' : 'images_questions';
        return `${directory}/${withoutPrefix}`;
    }

    /**
     * Get the GitHub image type name for a given field.
     *
     * @private
     * @param {string} fieldKey - Field key.
     * @returns {'question'|'answer'}
     */
    getImageTypeForField(fieldKey) {
        return fieldKey === 'answerImage' ? 'answer' : 'question';
    }

    /**
     * Read a file as data URL for inline embedding.
     *
     * @private
     * @param {File} file - Image file to read.
     * @returns {Promise<string|null>}
     */
    readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            if (!file) {
                resolve(null);
                return;
            }

            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
    }
}
