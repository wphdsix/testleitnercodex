/**
 * Interactive table component providing search and column level filtering.
 */
export class FilterableTable {
    /**
     * @param {Object} options - Configuration.
     * @param {HTMLElement} options.container - Wrapper element hosting the table.
     * @param {{key: string, label: string, formatter?: Function}} options.columns - Column definitions.
     * @param {string} [options.emptyMessage] - Text displayed when no data is available.
     * @param {string} [options.ariaLabel] - Accessible label applied to the table.
     * @param {import('../keyboardManager.js').KeyboardManager} [options.keyboardManager] - Shortcut registry.
     */
    constructor({ container, columns, emptyMessage = 'Aucune donnée', ariaLabel, keyboardManager } = {}) {
        this.container = container;
        this.columns = Array.isArray(columns) ? columns : [];
        this.emptyMessage = emptyMessage;
        this.ariaLabel = ariaLabel;
        this.keyboardManager = keyboardManager || null;

        this.data = [];
        this.filtered = [];
        this.searchTerm = '';

        this.handleSearch = this.handleSearch.bind(this);
    }

    /**
     * Render the initial skeleton and attach listeners.
     *
     * @returns {void}
     */
    init() {
        if (!this.container) {
            console.warn('FilterableTable requires a container element.');
            return;
        }

        this.container.classList.add('filterable-table');
        this.container.innerHTML = '';

        const toolbar = document.createElement('div');
        toolbar.className = 'filterable-table__toolbar';

        const label = document.createElement('label');
        label.className = 'filterable-table__label';
        label.textContent = 'Filtrer les sessions';
        label.setAttribute('for', `${this.container.id || 'filterable-table'}-search`);

        const input = document.createElement('input');
        input.type = 'search';
        input.id = `${this.container.id || 'filterable-table'}-search`;
        input.className = 'filterable-table__search';
        input.placeholder = 'Rechercher par date ou contexte';
        input.addEventListener('input', this.handleSearch);

        label.appendChild(input);
        toolbar.appendChild(label);

        const table = document.createElement('table');
        table.className = 'filterable-table__table';
        if (this.ariaLabel) {
            table.setAttribute('aria-label', this.ariaLabel);
        }

        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        this.columns.forEach((column) => {
            const th = document.createElement('th');
            th.scope = 'col';
            th.textContent = column.label;
            headRow.appendChild(th);
        });
        thead.appendChild(headRow);

        const tbody = document.createElement('tbody');
        tbody.className = 'filterable-table__body';

        table.append(thead, tbody);

        const empty = document.createElement('div');
        empty.className = 'filterable-table__empty';
        empty.textContent = this.emptyMessage;
        empty.setAttribute('role', 'status');
        empty.setAttribute('aria-live', 'polite');

        this.container.append(toolbar, table, empty);

        this.elements = { toolbar, input, table, tbody, empty };

        if (this.keyboardManager) {
            this.keyboardManager.registerShortcut('ctrl+f', () => {
                input.focus();
                input.select?.();
            }, {
                description: 'Focus sur la recherche de la table des sessions',
                element: input,
                global: true
            });
        }

        this.render();
    }

    /**
     * Update the dataset displayed by the table.
     *
     * @param {Array<Object>} rows - Rows to display.
     * @returns {void}
     */
    setData(rows) {
        this.data = Array.isArray(rows) ? [...rows] : [];
        this.applyFilters();
    }

    /**
     * Handle changes in the search field.
     *
     * @returns {void}
     */
    handleSearch(event) {
        this.searchTerm = event.target.value.toLowerCase();
        this.applyFilters();
    }

    /**
     * Apply filters to the dataset and re-render the table.
     *
     * @returns {void}
     */
    applyFilters() {
        if (!Array.isArray(this.data)) {
            this.filtered = [];
        } else if (!this.searchTerm) {
            this.filtered = [...this.data];
        } else {
            this.filtered = this.data.filter((row) => {
                return Object.values(row).some((value) =>
                    String(value).toLowerCase().includes(this.searchTerm)
                );
            });
        }

        this.render();
    }

    /**
     * Render rows or fallback message depending on the filtered dataset.
     *
     * @returns {void}
     */
    render() {
        if (!this.elements) {
            return;
        }

        const { tbody, empty } = this.elements;
        tbody.innerHTML = '';

        if (!this.filtered.length) {
            empty.classList.remove('hidden');
            return;
        }

        empty.classList.add('hidden');
        this.filtered.forEach((row) => {
            const tr = document.createElement('tr');
            this.columns.forEach((column) => {
                const cell = document.createElement('td');
                const value = row[column.key];
                cell.textContent = typeof column.formatter === 'function'
                    ? column.formatter(value, row)
                    : String(value ?? '');
                tr.appendChild(cell);
            });
            tbody.appendChild(tr);
        });
    }
}
