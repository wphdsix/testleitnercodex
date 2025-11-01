/**
 * Inline CSV editor rendering a content editable table backed by a textarea to
 * preserve compatibility with copy/paste workflows.
 */
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
                            <th scope="col">Question</th>
                            <th scope="col">Réponse</th>
                            <th scope="col">Boîte</th>
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
        this.data = cards.map(card => ({
            question: card.question || '',
            answer: card.answer || '',
            box: card.box || 1
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

        const rows = text.split(/\r?\n/);
        this.data = rows.map((row) => {
            const [question = '', answer = '', box = '1'] = row.split(';');
            return { question, answer, box: Number(box) || 1 };
        });
        this.renderRows();
        this.setStatus(`${this.data.length} lignes importées depuis la zone texte.`);
    }

    /**
     * Handle edits performed inside the table.
     *
     * @param {Event} event - Input event triggered by contentEditable cells.
     * @returns {void}
     */
    handleTableInput(event) {
        const cell = event.target;
        if (!cell.dataset?.rowIndex || !cell.dataset?.field) {
            return;
        }

        const index = Number(cell.dataset.rowIndex);
        const field = cell.dataset.field;
        this.data[index][field] = field === 'box'
            ? Number(cell.textContent.trim()) || 1
            : cell.textContent.trim();

        this.syncTextarea();
    }

    /**
     * Append an empty row to the dataset.
     *
     * @returns {void}
     */
    handleAddRow() {
        this.data.push({ question: '', answer: '', box: 1 });
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
        const content = this.data.map(row => `${row.question};${row.answer};${row.box}`).join('\n');
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

        this.elements.textarea.value = this.data
            .map(row => `${row.question};${row.answer};${row.box}`)
            .join('\n');
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
            cell.colSpan = 3;
            cell.textContent = 'Aucune donnée. Ajoutez une ligne pour commencer.';
            emptyRow.appendChild(cell);
            body.appendChild(emptyRow);
            return;
        }

        this.data.forEach((row, index) => {
            const tr = document.createElement('tr');
            ['question', 'answer', 'box'].forEach((field) => {
                const td = document.createElement('td');
                td.contentEditable = 'true';
                td.dataset.rowIndex = String(index);
                td.dataset.field = field;
                td.className = 'csv-inline-editor__cell';
                td.textContent = row[field];
                tr.appendChild(td);
            });
            body.appendChild(tr);
        });
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
}
