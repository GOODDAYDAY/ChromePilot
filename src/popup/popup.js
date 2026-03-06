/**
 * ChromePilot Popup
 */

const commandInput = document.getElementById('commandInput');
const submitBtn = document.getElementById('submitBtn');
const resultDiv = document.getElementById('result');

function setResult(text, isError = false) {
    resultDiv.textContent = text;
    resultDiv.className = isError ? 'result error' : 'result success';
}

async function executeCommand() {
    const command = commandInput.value.trim();
    if (!command) return;

    submitBtn.disabled = true;
    setResult('Running...');

    try {
        const response = await chrome.runtime.sendMessage({
            type: 'EXECUTE_COMMAND',
            command
        });

        if (response && response.success) {
            setResult(response.message);
        } else {
            setResult(response?.error || 'Unknown error occurred', true);
        }
    } catch (error) {
        setResult(error.message, true);
    } finally {
        submitBtn.disabled = false;
    }
}

submitBtn.addEventListener('click', executeCommand);

commandInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        executeCommand();
    }
});

commandInput.focus();
