// Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileNameDisplay = document.getElementById('file-name');
const analyzeBtn = document.getElementById('analyze-btn');
const jobDescriptionInput = document.getElementById('job-description');
const loadingSpinner = document.getElementById('loading-spinner');
const resultsSection = document.getElementById('results-section');

const scoreMeter = document.getElementById('score-meter');
const scoreNumber = document.getElementById('score-number');
const scoreMessage = document.getElementById('score-message');
const extractedSkillsContainer = document.getElementById('extracted-skills');
const missingKeywordsContainer = document.getElementById('missing-keywords');
const improvementsContent = document.getElementById('improvements-content');

let selectedFile = null;
let extractedText = "";
let filePayload = null; // Used for PDF base64

// Drag and Drop Events
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
        dropZone.classList.add('dragover');
    }, false);
});

['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
        dropZone.classList.remove('dragover');
    }, false);
});

dropZone.addEventListener('drop', (e) => {
    let dt = e.dataTransfer;
    let files = dt.files;
    handleFiles(files);
});

fileInput.addEventListener('change', function() {
    handleFiles(this.files);
});

function handleFiles(files) {
    if (files.length > 0) {
        const file = files[0];
        
        if (!file.name.toLowerCase().match(/\.(pdf|doc|docx)$/)) {
            alert('Please upload a PDF or Word document (.docx).');
            return;
        }

        selectedFile = file;
        fileNameDisplay.textContent = file.name;
        fileNameDisplay.style.display = 'block';
        analyzeBtn.disabled = false;
        
        processFile(file);
    }
}

async function processFile(file) {
    try {
        const extension = file.name.split('.').pop().toLowerCase();
        
        if (extension === 'pdf') {
            const base64 = await fileToBase64(file);
            filePayload = {
                data: base64.split(',')[1],
                mimeType: "application/pdf"
            };
            extractedText = "";
            console.log("PDF prepared for upload.");
        } else if (extension === 'docx' || extension === 'doc') {
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
            extractedText = result.value;
            filePayload = null;
            console.log("DOCX text extracted.");
        }
    } catch (error) {
        console.error("Error processing file:", error);
        alert("Could not read the file. Please try a different file.");
        selectedFile = null;
        fileNameDisplay.textContent = "";
        analyzeBtn.disabled = true;
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// Analyze Button Click
analyzeBtn.addEventListener('click', async () => {
    const jobDescription = jobDescriptionInput.value.trim();
    
    if (!extractedText && !filePayload) {
        alert("No resume data found. Please wait or upload again.");
        return;
    }

    // UI State: Loading
    analyzeBtn.disabled = true;
    loadingSpinner.classList.remove('hidden');
    resultsSection.classList.add('hidden');
    
    try {
        const analysis = await callLocalBackendAPI(extractedText, filePayload, jobDescription);
        updateDashboard(analysis);
        
        // UI State: Done
        loadingSpinner.classList.add('hidden');
        resultsSection.classList.remove('hidden');
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
    } catch (error) {
        console.error(error);
        alert(`Analysis failed: ${error.message}`);
        loadingSpinner.classList.add('hidden');
        analyzeBtn.disabled = false;
    }
});

// Backend Integration
async function callLocalBackendAPI(resumeText, filePayload, jobDesc) {
    // Automatically switch between local testing and live deployed backend
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    // TODO: Replace the live URL below with your actual Render.com URL later!
    const backendBaseUrl = isLocalhost 
        ? 'http://localhost:3000' 
        : 'https://my-ai-resume-backend.onrender.com'; 
        
    const endpoint = `${backendBaseUrl}/api/analyze`;
    
    const requestBody = {
        resumeText: resumeText,
        filePayload: filePayload,
        jobDescription: jobDesc || ""
    };

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "API request failed");
    }

    const data = await response.json();
    return data;
}

// Update DOM with results
function updateDashboard(data) {
    // 1. ATS Score Circle
    const score = data.atsScore || 0;
    scoreNumber.textContent = score;
    scoreMessage.textContent = data.scoreMessage || "";
    
    // Calculate SVG circle stroke dashoffset
    // radius = 40, circumference = 2 * Math.PI * 40 = 251.2
    const circumference = 251.2;
    const offset = circumference - (score / 100) * circumference;
    
    // Slight timeout for animation effect
    setTimeout(() => {
        scoreMeter.style.strokeDashoffset = offset;
        
        // Color based on score
        if (score >= 80) {
            scoreMeter.style.stroke = "var(--success)";
            scoreNumber.style.color = "var(--success)";
        } else if (score >= 60) {
            scoreMeter.style.stroke = "var(--warning)";
            scoreNumber.style.color = "var(--warning)";
        } else {
            scoreMeter.style.stroke = "var(--danger)";
            scoreNumber.style.color = "var(--danger)";
        }
    }, 100);

    // 2. Extracted Skills
    extractedSkillsContainer.innerHTML = '';
    if (data.extractedSkills && data.extractedSkills.length > 0) {
        data.extractedSkills.forEach(skill => {
            const span = document.createElement('span');
            span.className = 'tag match';
            span.innerHTML = `<i class="ri-check-line"></i> ${skill}`;
            extractedSkillsContainer.appendChild(span);
        });
    } else {
        extractedSkillsContainer.innerHTML = '<p class="text-muted">No specific skills extracted.</p>';
    }

    // 3. Missing Keywords
    missingKeywordsContainer.innerHTML = '';
    if (data.missingKeywords && data.missingKeywords.length > 0) {
        data.missingKeywords.forEach(keyword => {
            const span = document.createElement('span');
            span.className = 'tag miss';
            span.innerHTML = `<i class="ri-close-line"></i> ${keyword}`;
            missingKeywordsContainer.appendChild(span);
        });
    } else {
        missingKeywordsContainer.innerHTML = '<p class="text-muted" style="color: var(--success)">Looks good! No critical missing keywords found.</p>';
    }

    // 4. Improvements (Markdown rendering)
    if (data.improvementSuggestions) {
        improvementsContent.innerHTML = marked.parse(data.improvementSuggestions);
    } else {
        improvementsContent.innerHTML = "<p>No suggestions provided.</p>";
    }
    
    analyzeBtn.disabled = false;
}
