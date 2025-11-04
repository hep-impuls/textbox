// script.js - v5 (Paragraphs & Custom Editor Config)

(function() {
    'use strict';

    // --- CONFIGURATION & STATE---
    const STORAGE_PREFIX = 'textbox-assignment_';
    const SUB_STORAGE_PREFIX = 'textbox-sub_';
    const PARAGRAPHS_PREFIX = 'textbox-paragraphs_'; // Changed from QUESTIONS_PREFIX
    let quill; 

    // --- HELPER FUNCTIONS ---
    const isExtensionActive = () => document.documentElement.hasAttribute('data-extension-installed');

    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    const getQueryParams = () => new URLSearchParams(window.location.search);

    const parseMarkdown = (text) => {
        if (!text) return '';
        text = text.replace(/(\*\*|__)(?=\S)(.*?)(?<=\S)\1/g, '<strong>$2</strong>');
        text = text.replace(/(\*|_)(?=\S)(.*?)(?<=\S)\1/g, '<em>$2</em>');
        return text;
    };

    function showSaveIndicator() {
        const indicator = document.getElementById('saveIndicator');
        if (!indicator) return;
        indicator.style.opacity = '1';
        setTimeout(() => { indicator.style.opacity = '0'; }, 2000);
    }

    // --- DATA SAVING & LOADING (Unchanged) ---
    function saveContent() {
        if (!quill) return;
        const htmlContent = quill.root.innerHTML;
        if (htmlContent === '<p><br></p>' || htmlContent === '') return;

        const params = getQueryParams();
        const assignmentId = params.get('assignmentId');
        const subId = params.get('subIds');
        if (!assignmentId || !subId) return;

        if (isExtensionActive()) {
            const extensionKey = `${assignmentId}|${subId}`;
            window.dispatchEvent(new CustomEvent('ab-save-request', {
                detail: { key: extensionKey, content: htmlContent }
            }));
        } else {
            const localStorageKey = `${STORAGE_PREFIX}${assignmentId}_${SUB_STORAGE_PREFIX}${subId}`;
            localStorage.setItem(localStorageKey, htmlContent);
        }
        showSaveIndicator();
    }
    const debouncedSave = debounce(saveContent, 1500);

    function loadContent() {
        const params = getQueryParams();
        const assignmentId = params.get('assignmentId');
        const subId = params.get('subIds');
        if (!assignmentId || !subId || !quill) return;

        if (isExtensionActive()) {
            const extensionKey = `${assignmentId}|${subId}`;
            window.addEventListener('ab-load-response', (e) => {
                if (e.detail.key === extensionKey && e.detail.content) {
                    quill.root.innerHTML = e.detail.content;
                }
            }, { once: true });
            window.dispatchEvent(new CustomEvent('ab-load-request', {
                detail: { key: extensionKey }
            }));
        } else {
            const localStorageKey = `${STORAGE_PREFIX}${assignmentId}_${SUB_STORAGE_PREFIX}${subId}`;
            const savedText = localStorage.getItem(localStorageKey);
            if (savedText) {
                quill.root.innerHTML = savedText;
            }
        }
    }

    // --- PARAGRAPH HANDLING (Replaces Question Handling) ---
    function getParagraphsFromUrlAndSave() {
        const params = getQueryParams();
        const assignmentId = params.get('assignmentId');
        const subId = params.get('subIds');
        if (!assignmentId || !subId) return { subId: null, paragraphs: {} };
        
        const paragraphs = {};
        params.forEach((value, key) => {
            // Look for 'p' prefixes like p1, p2, etc.
            if (key.match(/^p\d+$/)) {
                paragraphs[key] = value;
            }
        });

        if (Object.keys(paragraphs).length > 0) {
            const storageKey = `${PARAGRAPHS_PREFIX}${assignmentId}_${SUB_STORAGE_PREFIX}${subId}`;
            try {
                localStorage.setItem(storageKey, JSON.stringify(paragraphs));
            } catch (e) { console.error("Error saving paragraphs:", e); }
        }
        return { subId, paragraphs };
    }

    function getParagraphsHtmlFromStorage(assignmentId, subId) {
        const key = `${PARAGRAPHS_PREFIX}${assignmentId}_${SUB_STORAGE_PREFIX}${subId}`;
        const stored = localStorage.getItem(key);
        if (!stored) return '';
        try {
            const paragraphsObject = JSON.parse(stored);
            const sortedKeys = Object.keys(paragraphsObject).sort((a, b) => (parseInt(a.replace('p', ''), 10) - parseInt(b.replace('p', ''), 10)));
            
            let html = '<div class="paragraphs-print">'; // Use a different class for printing
            sortedKeys.forEach(pKey => {
                html += `<p>${parseMarkdown(paragraphsObject[pKey])}</p>`;
            });
            html += '</div>';
            return html;
        } catch (e) { return ''; }
    }

    // --- PRINTING LOGIC ---
    function printAllSubIdsForAssignment() {
        const assignmentId = getQueryParams().get('assignmentId') || 'defaultAssignment';

        const processAndPrint = (data, sourceIsExtension) => {
            const subIdAnswerMap = new Map();
            const subIdSet = new Set();
            const assignmentSuffix = assignmentId.includes('_') ? assignmentId.substring(assignmentId.indexOf('_') + 1) : assignmentId;

            if (sourceIsExtension) {
                for (const key in data) {
                    const [keyAssignmentId, subId] = key.split('|');
                    if (keyAssignmentId === assignmentId) {
                        subIdAnswerMap.set(subId, data[key]);
                        subIdSet.add(subId);
                    }
                }
            } else { 
                const answerPrefix = `${STORAGE_PREFIX}${assignmentId}_${SUB_STORAGE_PREFIX}`;
                for (let i = 0; i < data.length; i++) {
                    const key = data.key(i);
                    if (key && key.startsWith(answerPrefix)) {
                        const subId = key.substring(answerPrefix.length);
                        subIdAnswerMap.set(subId, data.getItem(key));
                        subIdSet.add(subId);
                    }
                }
            }

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(`${PARAGRAPHS_PREFIX}${assignmentId}`)) {
                    const subId = key.substring(key.indexOf(SUB_STORAGE_PREFIX) + SUB_STORAGE_PREFIX.length);
                    subIdSet.add(subId);
                }
            }
            if (subIdSet.size === 0) {
                 alert("Keine gespeicherten Themen für dieses Kapitel gefunden.");
                 return;
            }

            const sortedSubIds = Array.from(subIdSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
            let allContent = `<h2>${assignmentSuffix}</h2>`;
            sortedSubIds.forEach((subId, index) => {
                const answerContent = subIdAnswerMap.get(subId);
                const paragraphsHtml = getParagraphsHtmlFromStorage(assignmentId, subId); // Updated function call
                if (paragraphsHtml || answerContent) {
                    const blockClass = 'sub-assignment-block' + (index > 0 ? ' new-page' : '');
                    allContent += `<div class="${blockClass}">`;
                    allContent += `<h3>Thema: ${subId}</h3>`;
                    if (paragraphsHtml) allContent += paragraphsHtml;
                    allContent += `<div class="lined-content">${answerContent || '<p><em>Antworten:</em></p>'}</div>`;
                    allContent += `</div>`;
                }
            });
            printFormattedContent(allContent, assignmentSuffix);
        };

        if (isExtensionActive()) {
            window.addEventListener('ab-get-all-response', (e) => {
                processAndPrint(e.detail.allData || {}, true);
            }, { once: true });
            window.dispatchEvent(new CustomEvent('ab-get-all-request'));
        } else {
            processAndPrint(localStorage, false);
        }
    }

    function printFormattedContent(content, printWindowTitle = 'Alle Antworten') {
        const printWindow = window.open('', '', 'height=800,width=800');
        if (!printWindow) { alert("Bitte erlauben Sie Pop-up-Fenster, um drucken zu können."); return; }
        const lineHeight = '1.4em';
        const lineColor = '#d2d2d2';
        
        // **MODIFIED**: Changed h2 and h3 color to #002f6c as requested
        printWindow.document.write(`<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>${printWindowTitle}</title><meta http-equiv="Content-Security-Policy" content="img-src 'self' data:"><style>body{font-family:Arial,sans-serif;color:#333;line-height:${lineHeight};padding:${lineHeight};margin:0;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}@page{size:A4;margin:1cm}.lined-content{background-color:#fdfdfa;position:relative;min-height:calc(22 * ${lineHeight});height:auto;overflow:visible;background-image:repeating-linear-gradient(to bottom,transparent 0,transparent calc(${lineHeight} - 1px),${lineColor} calc(${lineHeight} - 1px),${lineColor} ${lineHeight});background-size:100% ${lineHeight};background-position:0 0;background-repeat:repeat-y}h1,h2,h3,p,li,div,.paragraphs-print,.sub-assignment-block{line-height:inherit;background-color:transparent!important;margin-top:0;margin-bottom:0}h2{color:#002f6c;margin-bottom:${lineHeight}}h3{color:#002f6c;margin-top:${lineHeight};margin-bottom:${lineHeight};page-break-after:avoid}.paragraphs-print p{margin-bottom:0.5em;}.sub-assignment-block{margin-bottom:${lineHeight};padding-top:.1px}img{max-width:100%;height:auto;display:block;page-break-inside:avoid;margin-top:${lineHeight};margin-bottom:${lineHeight}}@media print{.sub-assignment-block{page-break-after:always}.sub-assignment-block:last-child{page-break-after:auto}}</style></head><body>${content}</body></html>`);
        printWindow.document.close();
        printWindow.onload = () => { setTimeout(() => { printWindow.focus(); printWindow.print(); }, 500); };
    }

    // --- PAGE INITIALIZATION ---
    document.addEventListener("DOMContentLoaded", function() {
        quill = new Quill('#answerBox', {
            theme: 'snow',
            placeholder: 'Gib hier deinen Text ein...',
            modules: {
                // **MODIFIED**: Toolbar without list buttons
                toolbar: [
                    ['bold', 'italic', 'underline'],
                    ['clean']
                ],
                // **MODIFIED**: Keyboard module to disable auto-formatting lists
                keyboard: {
                    bindings: {
                        'list autofill override': {
                            key: ' ',
                            prefix: /^\s*([*]|\d+\.)$/,
                            handler: function() {
                                return true; // Prevents list creation, just inserts a space
                            }
                        }
                    }
                }
            }
        });
        
        // Keep the paste-only-image functionality
        if (quill.root) {
            quill.root.addEventListener('paste', function(e) {
                e.preventDefault();
                const items = (e.clipboardData || window.clipboardData).items;
                let imageFound = false;
                for (const item of items) {
                    if (item.type.indexOf('image') !== -1) {
                        imageFound = true;
                        const blob = item.getAsFile();
                        if (!blob) continue;
                        const reader = new FileReader();
                        reader.onload = function(event) {
                            const base64Image = event.target.result;
                            const range = quill.getSelection(true);
                            quill.insertEmbed(range.index, 'image', base64Image);
                        };
                        reader.readAsDataURL(blob);
                    }
                }
                if (!imageFound) {
                    alert("Das Einfügen von Text ist deaktiviert. Sie können nur Bilder einfügen.");
                }
            });
        }

        quill.on('text-change', (delta, oldDelta, source) => {
            if (source === 'user') { debouncedSave(); }
        });

        const { subId, paragraphs } = getParagraphsFromUrlAndSave();
        const subIdInfoElement = document.getElementById('subIdInfo');
        if (subId) {
            const sortedParagraphKeys = Object.keys(paragraphs).sort((a, b) => (parseInt(a.replace('p', ''), 10) - parseInt(b.replace('p', ''), 10)));
            if (sortedParagraphKeys.length > 0) {
                let infoHtml = '<div class="paragraphs-container">';
                sortedParagraphKeys.forEach(key => {
                    infoHtml += `<p>${parseMarkdown(paragraphs[key])}</p>`;
                });
                infoHtml += '</div>';
                subIdInfoElement.innerHTML = infoHtml;
            }
        }

        loadContent();

        const printAllSubIdsBtn = document.createElement('button');
        printAllSubIdsBtn.id = 'printAllSubIdsBtn';
        printAllSubIdsBtn.textContent = 'Alle Inhalte drucken / Als PDF speichern';
        printAllSubIdsBtn.addEventListener('click', printAllSubIdsForAssignment);
        document.querySelector('.button-container').appendChild(printAllSubIdsBtn);
    });

})();