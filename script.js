let calculationHistory = [];
let currentResult = null;
let currentResultInches = null;
let displayInInchesOnly = false;
let displayAsDecimal = false;
let pendingModalAction = null;
const MAX_HISTORY = 20;
const STORAGE_KEY = "imperialCalcHistory";

// Load history from memory storage on startup
function loadHistory() {
  const stored = sessionStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      calculationHistory = JSON.parse(stored);
      updateHistoryDisplay();
    } catch (e) {
      console.error("Failed to load history:", e);
      calculationHistory = [];
    }
  }
}

// Save history to memory storage
function saveHistory() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(calculationHistory));
  } catch (e) {
    console.error("Failed to save history:", e);
  }
}

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) {
    let t = b;
    b = a % b;
    a = t;
  }
  return a;
}

function reduceFraction(num, den) {
  const divisor = gcd(num, den);
  return [num / divisor, den / divisor];
}

function parseImperialInput(input) {
  input = input.trim();

  // Normalize curly quotes to straight quotes (for iOS compatibility)
  input = input.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');

  let totalInches = 0;

  const feetMatch = input.match(/(\d+\.?\d*|\d*\.?\d+)\s*'/);
  const inchesMatch = input.match(/(\d+\.?\d*|\d*\.?\d+)?\s*(\d+\/\d+)?\s*"/);

  if (feetMatch) {
    totalInches += parseFloat(feetMatch[1]) * 12;
  }

  if (inchesMatch) {
    let inchValue = 0;

    if (inchesMatch[1]) {
      inchValue += parseFloat(inchesMatch[1]);
    }

    if (inchesMatch[2]) {
      const [fNum, fDen] = inchesMatch[2].split("/").map(Number);
      inchValue += fNum / fDen;
    }

    totalInches += inchValue;
  }

  if (!feetMatch && !inchesMatch) {
    const mixedMatch = input.match(/^(\d+\.?\d*)?\s*(\d+\/\d+)?$/);
    if (mixedMatch) {
      let inchValue = 0;
      if (mixedMatch[1]) {
        inchValue += parseFloat(mixedMatch[1]);
      }
      if (mixedMatch[2]) {
        const [fNum, fDen] = mixedMatch[2].split("/").map(Number);
        inchValue += fNum / fDen;
      }
      totalInches += inchValue;
    }
  }

  return totalInches;
}

function inchesToImperial(inches) {
  const isNegative = inches < 0;
  inches = Math.abs(inches);

  const sixteenths = Math.round(inches * 16);

  const feet = Math.floor(sixteenths / (12 * 16));
  const remainingSixteenths = sixteenths - feet * 12 * 16;

  const [num, den] = reduceFraction(remainingSixteenths, 16);

  const wholeInches = Math.floor(num / den);
  const fracNum = num % den;

  let result = isNegative ? "−" : "";

  if (feet > 0) {
    result += `${feet}'`;
    if (wholeInches > 0 || fracNum > 0) {
      result += " ";
    }
  }

  if (wholeInches > 0 || fracNum > 0 || feet === 0) {
    if (wholeInches > 0) {
      result += wholeInches;
      if (fracNum > 0) {
        result += " ";
      }
    }

    if (fracNum > 0) {
      result += `${fracNum}/${den}`;
    }

    if (wholeInches === 0 && fracNum === 0) {
      result += "0";
    }

    result += '"';
  }

  return result;
}

function formatAsInchesOnly(inches) {
  const isNegative = inches < 0;
  inches = Math.abs(inches);

  const sixteenths = Math.round(inches * 16);
  const [num, den] = reduceFraction(sixteenths, 16);

  let inchesDisplay = isNegative ? "−" : "";
  const wholeInches = Math.floor(num / den);
  const fracNum = num % den;

  if (wholeInches > 0) {
    inchesDisplay += wholeInches;
    if (fracNum > 0) {
      inchesDisplay += " ";
    }
  }

  if (fracNum > 0) {
    inchesDisplay += `${fracNum}/${den}`;
  }

  if (wholeInches === 0 && fracNum === 0) {
    inchesDisplay += "0";
  }

  return `${inchesDisplay}"`;
}

function formatAsDecimal(inches) {
  return inches.toFixed(4).replace(/\.?0+$/, "") + '"';
}

function formatResult(inches) {
  if (displayAsDecimal) {
    return formatAsDecimal(inches);
  } else if (displayInInchesOnly) {
    return formatAsInchesOnly(inches);
  } else {
    return inchesToImperial(inches);
  }
}

function addOperator(op) {
  const input = document.getElementById("equationInput");
  let value = input.value.trim();

  // If we have a current result and input is empty, start with result
  if (currentResultInches !== null && value === "") {
    const resultStr = formatResult(currentResultInches);
    input.value = resultStr + " " + op + " ";
  } else if (value && !value.endsWith(" ")) {
    // Add operator to current input
    input.value = value + " " + op + " ";
  }

  // Move cursor to end
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

// Insert a character from the number pad at the cursor position
function pressKey(ch) {
  const input = document.getElementById("equationInput");
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.setRangeText(ch, start, end, "end");
  document.getElementById("error").textContent = "";
  input.focus();
}

function backspace() {
  const input = document.getElementById("equationInput");
  let start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;

  if (start === end) {
    if (start === 0) return;
    // Remove a whole " + " operator at once, otherwise one character
    const before = input.value.slice(0, start);
    start -= / [+\-*/] $/.test(before) ? 3 : 1;
  }

  input.setRangeText("", start, end, "end");
  input.focus();
}

function parseEquation(equation) {
  // Split by operators while keeping them
  // Use a more careful regex that preserves spaces in measurements
  const parts = [];
  let current = "";

  for (let i = 0; i < equation.length; i++) {
    const char = equation[i];

    if (["+", "-", "*", "/"].includes(char)) {
      // Check if this is an operator or part of a measurement
      // Look ahead and behind for context
      const prevChar = i > 0 ? equation[i - 1] : "";
      const nextChar = i < equation.length - 1 ? equation[i + 1] : "";

      // If preceded and followed by spaces, it's likely an operator
      if (prevChar === " " && nextChar === " ") {
        if (current.trim()) parts.push(current.trim());
        parts.push(char);
        current = "";
        i++; // skip the space after operator
      } else {
        current += char;
      }
    } else {
      current += char;
    }
  }

  if (current.trim()) parts.push(current.trim());

  let values = [];
  let operators = [];

  for (let token of parts) {
    if (["+", "-", "*", "/"].includes(token)) {
      operators.push(token);
    } else {
      const inches = parseImperialInput(token);
      if (isNaN(inches)) {
        throw new Error("Invalid measurement: " + token);
      }
      values.push(inches);
    }
  }

  // Order of operations: multiply and divide first
  let i = 0;
  while (i < operators.length) {
    if (operators[i] === "*" || operators[i] === "/") {
      const left = values[i];
      const right = values[i + 1];
      let result;

      if (operators[i] === "*") {
        result = left * right;
      } else {
        if (right === 0) throw new Error("Cannot divide by zero");
        result = left / right;
      }

      values.splice(i, 2, result);
      operators.splice(i, 1);
    } else {
      i++;
    }
  }

  // Then add and subtract
  let result = values[0];
  for (let i = 0; i < operators.length; i++) {
    if (operators[i] === "+") {
      result += values[i + 1];
    } else if (operators[i] === "-") {
      result -= values[i + 1];
    }
  }

  return result;
}

function calculateResult() {
  const input = document.getElementById("equationInput");
  const equation = input.value.trim();
  const errorEl = document.getElementById("error");
  const resultDisplay = document.getElementById("resultDisplay");
  const unitConvertBtn = document.getElementById("unitConvertBtn");
  const decimalConvertBtn = document.getElementById("decimalConvertBtn");

  errorEl.textContent = "";

  try {
    if (!equation) {
      throw new Error("Please enter a measurement");
    }

    const resultInches = parseEquation(equation);
    currentResultInches = resultInches;

    const resultFormatted = formatResult(resultInches);
    resultDisplay.textContent = resultFormatted;
    currentResult = resultFormatted;

    // Save to history
    addToHistory(equation, resultFormatted);

    // Clear input
    input.value = "";

    // Enable convert buttons
    unitConvertBtn.disabled = false;
    decimalConvertBtn.disabled = false;

    // Update button text based on current state
    updateConvertButtons();
  } catch (error) {
    errorEl.textContent = error.message;
    currentResultInches = null;
    currentResult = null;
    unitConvertBtn.disabled = true;
    decimalConvertBtn.disabled = true;
  }
}

function updateConvertButtons() {
  const unitConvertBtn = document.getElementById("unitConvertBtn");
  const decimalConvertBtn = document.getElementById("decimalConvertBtn");

  if (displayInInchesOnly) {
    unitConvertBtn.textContent = "Convert to Feet & Inches";
  } else {
    unitConvertBtn.textContent = "Convert to Inches";
  }

  if (displayAsDecimal) {
    decimalConvertBtn.textContent = "Convert to Fraction";
  } else {
    decimalConvertBtn.textContent = "Convert to Decimal";
  }
}

function toggleUnitDisplay() {
  if (currentResultInches === null) return;

  displayInInchesOnly = !displayInInchesOnly;
  const resultFormatted = formatResult(currentResultInches);
  document.getElementById("resultDisplay").textContent = resultFormatted;
  currentResult = resultFormatted;

  updateConvertButtons();
}

function toggleDecimalDisplay() {
  if (currentResultInches === null) return;

  displayAsDecimal = !displayAsDecimal;
  const resultFormatted = formatResult(currentResultInches);
  document.getElementById("resultDisplay").textContent = resultFormatted;
  currentResult = resultFormatted;

  updateConvertButtons();
}

function clearAll() {
  document.getElementById("equationInput").value = "";
  document.getElementById("resultDisplay").textContent = "—";
  document.getElementById("error").textContent = "";
  currentResult = null;
  currentResultInches = null;
  document.getElementById("unitConvertBtn").disabled = true;
  document.getElementById("decimalConvertBtn").disabled = true;
}

function addToHistory(equation, result) {
  const timestamp = new Date().toLocaleString();

  calculationHistory.unshift({
    equation,
    result,
    timestamp,
    id: Date.now(),
  });

  // Keep only last 20
  if (calculationHistory.length > MAX_HISTORY) {
    calculationHistory = calculationHistory.slice(0, MAX_HISTORY);
  }

  saveHistory();
  updateHistoryDisplay();
}

function updateHistoryDisplay() {
  const historyList = document.getElementById("historyList");

  if (calculationHistory.length === 0) {
    historyList.innerHTML = '<div class="history-empty">No calculations saved yet</div>';
    return;
  }

  historyList.innerHTML = calculationHistory
    .map(
      (calc) => `
                <div class="history-item">
                    <div class="history-item-content">
                        <strong>${calc.equation} = ${calc.result}</strong><br>
                        <small style="color: #888;">${calc.timestamp}</small>
                    </div>
                    <button class="history-item-delete" onclick="event.stopPropagation(); showDeleteHistoryItemModal(${calc.id})">Delete</button>
                </div>
            `,
    )
    .join("");
}

function showDeleteHistoryItemModal(id) {
  pendingModalAction = () => deleteHistoryItem(id);
  document.getElementById("modalMessage").textContent = "Do you want to delete this calculation from history?";
  document.getElementById("confirmModal").classList.add("show");
}

function showClearHistoryModal() {
  if (calculationHistory.length === 0) return;

  pendingModalAction = () => {
    calculationHistory = [];
    saveHistory();
    updateHistoryDisplay();
  };
  document.getElementById("modalMessage").textContent = "Do you want to clear all calculation history?";
  document.getElementById("confirmModal").classList.add("show");
}

function deleteHistoryItem(id) {
  calculationHistory = calculationHistory.filter((calc) => calc.id !== id);
  saveHistory();
  updateHistoryDisplay();
}

function confirmAction() {
  if (pendingModalAction) {
    pendingModalAction();
    pendingModalAction = null;
  }
  closeModal();
}

function closeModal() {
  document.getElementById("confirmModal").classList.remove("show");
  pendingModalAction = null;
}

// Allow Enter key to calculate
document.getElementById("equationInput").addEventListener("keypress", function (e) {
  if (e.key === "Enter") {
    calculateResult();
  }
});

// When the number pad is showing, stop the phone's own keyboard from popping up over it
if (window.matchMedia("(max-width: 600px), (pointer: coarse)").matches) {
  document.getElementById("equationInput").setAttribute("inputmode", "none");
}

// Load history when page loads
loadHistory();
