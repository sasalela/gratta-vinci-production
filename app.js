// Logica del gioco Gratta & Vinci

// Riferimenti agli elementi del DOM
const canvas = document.getElementById('scratch');
const ctx = canvas.getContext('2d');
const resultDiv = document.getElementById('result');
const resetBtn = document.getElementById('resetBtn');

// Variabili di stato
let scratched = 0;
const threshold = 40; // Percentuale di raschiamento necessaria

// Setup iniziale
function initGame() {
  // Disegna il premio nascosto
  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 30px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Gratta & Vinci!', canvas.width / 2, canvas.height / 2 + 15);
  
  // Disegna il layer da raschiare
  ctx.fillStyle = '#999';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Aggiungi testo
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 20px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Clicca per raschiare', canvas.width / 2, canvas.height / 2);
}

// Funzione per il raschiamento
canvas.addEventListener('mousemove', function(e) {
  if (e.buttons === 1) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Cancella l'area
    ctx.clearRect(x - 15, y - 15, 30, 30);
    
    // Calcola la percentuale raschiata
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let pixels = imageData.data.length / 4;
    let scratched = 0;
    
    for (let i = 3; i < imageData.data.length; i += 4) {
      if (imageData.data[i] === 0) {
        scratched++;
      }
    }
    
    const percentage = (scratched / pixels) * 100;
    
    if (percentage > threshold) {
      showResult();
    }
  }
});

function showResult() {
  const results = ['Hai vinto 10€!', 'Riprova!', 'Hai vinto 50€!', 'Prossima volta!'];
  const isWinner = Math.random() > 0.5;
  const message = results[Math.floor(Math.random() * results.length)];
  
  resultDiv.textContent = message;
  resultDiv.className = 'result ' + (isWinner ? 'winner' : 'loser');
}

resetBtn.addEventListener('click', () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  resultDiv.textContent = '';
  resultDiv.className = 'result';
  initGame();
});

// Inizializza al caricamento
initGame();
