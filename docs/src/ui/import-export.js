// =================================================================
// Import / Export avancé – Leitner Codex
// Format CSV conforme :
// question_content,question_content_image,answer_content,answer_content_image,box_number,last_reviewed
// Valeurs entre guillemets doubles, échappement par double guillemet
// =================================================================

function escapeCsv(value) {
  if (value == null) return '""';
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
}

function todayIso() {
  return new Date().toISOString().split('T')[0];
}

function newCard() {
  return {
    question_content: '',
    question_content_image: '',
    answer_content: '',
    answer_content_image: '',
    box_number: '1',
    last_reviewed: todayIso()
  };
}

let cards = JSON.parse(localStorage.getItem('leitnerCards')) || [newCard()];

function renderCard(card, index) {
  const section = document.createElement('div');
  section.className = 'card-section';
  section.innerHTML = `
    <h3>Flashcard ${index + 1}</h3>
    <table>
      <tr><td><strong>Question</strong></td><td><textarea rows="3" data-field="question_content">${card.question_content}</textarea></td></tr>
      <tr><td><strong>Image question</strong></td><td><input type="text" data-field="question_content_image" value="${card.question_content_image}"></td></tr>
      <tr><td><strong>Réponse</strong></td><td><textarea rows="3" data-field="answer_content">${card.answer_content}</textarea></td></tr>
      <tr><td><strong>Image réponse</strong></td><td><input type="text" data-field="answer_content_image" value="${card.answer_content_image}"></td></tr>
      <tr><td><strong>Boîte (box_number)</strong></td><td><input type="number" min="1" step="1" data-field="box_number" value="${card.box_number}"></td></tr>
      <tr><td><strong>Dernière révision (last_reviewed)</strong></td><td><input type="date" data-field="last_reviewed" value="${card.last_reviewed}"></td></tr>
    </table>
    <button class="delete" data-index="${index}" style="margin-top:10px;">🗑️ Supprimer cette carte</button>
    <hr>
  `;

  // Synchronisation en temps réel
  section.querySelectorAll('[data-field]').forEach(el => {
    const field = el.dataset.field;
    el.addEventListener('input', () => {
      cards[index][field] = el.value;
      localStorage.setItem('leitnerCards', JSON.stringify(cards));
    });
  });

  section.querySelector('.delete').addEventListener('click', () => {
    cards.splice(index, 1);
    renderAllCards();
  });

  return section;
}

function renderAllCards() {
  const container = document.getElementById('cardsContainer');
  container.innerHTML = '';
  cards.forEach((card, i) => container.appendChild(renderCard(card, i)));
  localStorage.setItem('leitnerCards', JSON.stringify(cards));
}

// === Écouteurs d'événements ===

document.getElementById('addCard').addEventListener('click', () => {
  cards.push(newCard());
  renderAllCards();
});

document.getElementById('exportBtn').addEventListener('click', () => {
  const header = [
    'question_content',
    'question_content_image',
    'answer_content',
    'answer_content_image',
    'box_number',
    'last_reviewed'
  ].join(',');

  const rows = cards.map(c =>
    [
      escapeCsv(c.question_content),
      escapeCsv(c.question_content_image),
      escapeCsv(c.answer_content),
      escapeCsv(c.answer_content_image),
      escapeCsv(c.box_number),
      escapeCsv(c.last_reviewed)
    ].join(',')
  );

  const csvContent = [header, ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'flashcards_leitner.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

document.getElementById('importBtn').addEventListener('click', () => {
  const fileInput = document.getElementById('importCsv');
  const file = fileInput.files[0];
  if (!file) {
    alert('Veuillez sélectionner un fichier CSV.');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text = e.target.result;
      const lines = text.trim().split('\n');
      if (lines.length < 1) throw new Error('Fichier vide.');

      // Nettoyage de l'en-tête
      const cleanHeader = lines[0]
        .split(',')
        .map(h => h.trim().replace(/^"(.*)"$/, '$1'))
        .join(',');

      const expectedHeader = 'question_content,question_content_image,answer_content,answer_content_image,box_number,last_reviewed';
      if (cleanHeader !== expectedHeader) {
        throw new Error('En-tête invalide. Le format requis est :\\n' + expectedHeader);
      }

      const newCards = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Parsing manuel robuste pour valeurs entre guillemets
        const fields = [];
        let inQuotes = false;
        let current = '';
        for (let j = 0; j < line.length; j++) {
          const c = line[j];
          if (c === '"' && (j === 0 || line[j - 1] !== '\\')) {
            inQuotes = !inQuotes;
          } else if (c === ',' && !inQuotes) {
            fields.push(current.replace(/^"(.*)"$/, '$1').replace(/""/g, '"'));
            current = '';
          } else {
            current += c;
          }
        }
        fields.push(current.replace(/^"(.*)"$/, '$1').replace(/""/g, '"'));

        if (fields.length !== 6) {
          throw new Error(`Ligne ${i + 1} : mauvais nombre de colonnes (${fields.length} au lieu de 6).`);
        }

        newCards.push({
          question_content: fields[0] || '',
          question_content_image: fields[1] || '',
          answer_content: fields[2] || '',
          answer_content_image: fields[3] || '',
          box_number: fields[4] || '1',
          last_reviewed: fields[5] || todayIso()
        });
      }

      cards = newCards;
      renderAllCards();
      alert(`Succès : ${newCards.length} carte(s) importée(s).`);
    } catch (err) {
      console.error(err);
      alert('❌ Erreur d’import CSV :\\n' + err.message);
    }
  };
  reader.readAsText(file, 'utf-8');
});

// Rendu initial
renderAllCards();