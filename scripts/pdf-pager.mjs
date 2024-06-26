/*
PDF-PAGER

Copyright © 2022 Martin Smith

Permission is hereby granted, free of charge, to any person obtaining a copy of this software 
and associated documentation files (the "Software"), to deal in the Software without 
restriction, including without limitation the rights to use, copy, modify, merge, publish, 
distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the 
Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or 
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR 
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE 
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, 
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE 
SOFTWARE.
*/

import { PDFCONFIG } from './pdf-config.mjs';
import { initEditor } from './pdf-editable.mjs';
import { getPDFByCode } from './pdf-linker.mjs';

/**
 * @UUID{JournalEntry.T29aMDmLCPYybApI.JournalEntryPage.iYV6uMnFwdgZORxi#page=10}
 * 
 * puts data-hash attribute onto <a> class:
 *    <a class="content-link" draggable="true" data-hash="page=10" data-uuid="JournalEntry.T29aMDmLCPYybApI" data-id="T29aMDmLCPYybApI" data-type="JournalEntry" data-tooltip="Journal Entry"><i class="fas fa-book-open"></i>PDF</a>
 * 
 * In _onClickContentLink(event) we can access event.currentTarget.dataset.hash
 * sheet#render is passed (true, options {pageId, anchor: dataset.hash})
 * 
 * async JournalSheet.prototype._render(force,options)
 * calls renderPageViews
 * then looks for options.anchor and finds an entry in the toc
 */

Hooks.once('ready', async () => {
    // Need to capture the PDF page number
    libWrapper.register(PDFCONFIG.MODULE_NAME, 'JournalPDFPageSheet.prototype._renderInner',      JournalPDFPageSheet_renderInner,      libWrapper.WRAPPER);
    libWrapper.register(PDFCONFIG.MODULE_NAME, 'JournalEntryPage.prototype._onClickDocumentLink', JournalEntryPage_onClickDocumentLink, libWrapper.MIXED);
    libWrapper.register(PDFCONFIG.MODULE_NAME, 'JournalEntryPage.prototype.toc', JournalEntryPage_toc, libWrapper.MIXED);
    libWrapper.register(PDFCONFIG.MODULE_NAME, 'JournalSheet.prototype._render',         JournalSheet_render,         libWrapper.WRAPPER);
    libWrapper.register(PDFCONFIG.MODULE_NAME, 'JournalSheet.prototype.goToPage',        JournalSheet_goToPage,       libWrapper.MIXED);
    libWrapper.register(PDFCONFIG.MODULE_NAME, 'JournalSheet.prototype._renderHeadings', JournalSheet_renderHeadings, libWrapper.OVERRIDE);
});

// JournalEntryPage#toc only works when type === 'text'
function JournalEntryPage_toc(wrapped) {
    if (this.type !== 'pdf') return wrapped();
    if (!this._toc) this._toc = JSON.parse(this.getFlag(PDFCONFIG.MODULE_NAME, PDFCONFIG.FLAG_TOC) ?? "{}");
    return this._toc;
}

/**
 * 
 * @param {JournalPDFPageSheet} pdfsheet The PDF sheet to be affected
 * @param {String} anchor A page number or a TOC section string
 * @returns true if the change was made
 */
function updatePdfView(pdfsheet, anchor) {
    const linkService = pdfsheet?.pdfviewerapp?.pdfLinkService;
    if (!linkService || !anchor || anchor === "null") return false;

    const dest = anchor.startsWith('page=') ? 
        // Adjust page with configured PDF Page Offset
        `page=${+anchor.slice(5) + (pdfsheet.object.getFlag(PDFCONFIG.MODULE_NAME, PDFCONFIG.FLAG_OFFSET) ?? 0)}` : 
        // Convert our internal link name into a PDF outline slug
        pdfsheet.toc[anchor].pdfslug;

    console.debug(`updatePdfView(sheet='${pdfsheet.object.name}', anchor='${anchor}')\n=>'${dest}'`);
    linkService.setHash(dest);
    return true;
}

/* Determine if the PDF page is visible in the supplied journal sheet */
export function getPdfSheet(journalsheet, pageId) {
    if (journalsheet?._state === Application.RENDER_STATES.RENDERED &&
        journalsheet._pages[journalsheet.pageIndex]?._id === pageId) {
        let sheet = journalsheet.getPageSheet(pageId);
        if (sheet?.document?.type === 'pdf') return sheet;
    }
    return null;
}
/**
 * Process a click on a link to this document.
 * 
 * Don't rerender the PDF page if we can switch the displayed PDF internally to the correct page.
 * @param {} wrapper 
 * @param {*} event 
 * @returns 
 */
function JournalEntryPage_onClickDocumentLink(wrapper, event) {
    let pdfsheet = getPdfSheet(this.parent.sheet, this.id);
    if (updatePdfView(pdfsheet, decodeURIComponent(event.currentTarget.getAttribute('data-hash')))) {
        // Cancel any previous stored anchor
        delete pdfsheet.document.pdfpager_anchor;
        return;
    } else
        return wrapper(event);
}

/**
 * Process a click in the TOC.
 */
function JournalSheet_goToPage(wrapper, pageId, anchor) {
    let pdfsheet = getPdfSheet(this, pageId);
    if (pdfsheet && anchor) {
        if (updatePdfView(pdfsheet, anchor)) {
            // Moved within existing page - so no need to invoke the normal goToPage processing that will render a new page.
            delete pdfsheet.document.pdfpager_anchor;
            return;
        }
        // switch to the relevant page with the relevant slug (after page gets rendered)
        pdfsheet.document.pdfpager_anchor = anchor;
    }
    return wrapper(pageId, anchor);
}

/**
 * Convert PDF outline to Foundry TOC (see JournalEntryPage#buildTOC)
 * @param {PDFOutline} pdfoutline
 * @returns {Object<JournalEntryPageHeading>}
 */

function buildOutline(pdfoutline) {
    let root = {level: 0, children: []};
    function iterate(outline, parent) {
        for (let outlineNode of outline) {
            // Create a JournalEntryPageHeading from the PDF node:
            // see Foundry: JournalEntryPage#_makeHeadingNode
            const tocNode = {
                text:  outlineNode.title,
                level: parent.level+1,
                slug:  JournalEntryPage.slugifyHeading(outlineNode.title),
                children: [],
                // Our data below:
                pdfslug:  JSON.stringify(outlineNode.dest)
            };
            parent.children.push(tocNode);
            // Add children after the parent
            if (outlineNode.items?.length) iterate(outlineNode.items, tocNode);
        }
    }
    iterate(pdfoutline, root);
    return JournalEntryPage._flattenTOC(root.children);
}

/**
 * Adds the "Page Offset" field to the JournalPDFPageSheet EDITOR window.
 * @param {*} wrapper from libWrapper
 * @param  {sheetData} args an array of 1 element, the first element being the same as the data passed to the render function
 * @returns {jQuery} html
 */
 async function JournalPDFPageSheet_renderInner(wrapper, sheetData) {
    let html = await wrapper(sheetData);   // jQuery
    const pagedoc = sheetData.document;

    // Ensure we have a TOC on this sheet.
    // Emulate TextPageSheet._renderInner setting up the TOC
    let toc = this.object.getFlag(PDFCONFIG.MODULE_NAME, PDFCONFIG.FLAG_TOC);
    if (toc)
        this.toc = JSON.parse(toc);
    else   
        delete this.toc;

    if (this.isEditable) {
        // Editting, so add our own elements to the window
        const page_offset  = pagedoc.getFlag(PDFCONFIG.MODULE_NAME, PDFCONFIG.FLAG_OFFSET);
        const value_offset = page_offset ? ` value="${page_offset}"` : "";
        const label_offset = game.i18n.localize(`${PDFCONFIG.MODULE_NAME}.PageOffset.Label`);
        const elem_offset  = `<div class="form-group"><label>${label_offset}</label><input class="pageOffset" type="number" name="flags.${PDFCONFIG.MODULE_NAME}.${PDFCONFIG.FLAG_OFFSET}"${value_offset}/></div>`;

        const page_code   = pagedoc.getFlag(PDFCONFIG.MODULE_NAME, PDFCONFIG.FLAG_CODE);
        const value_code  = page_code ? ` value="${page_code}"` : "";
        const label_code  = game.i18n.localize(`${PDFCONFIG.MODULE_NAME}.Code.Label`);
        const elem_code   = `<div class="form-group"><label>${label_code}</label><input class="pageCode" type="text" name="flags.${PDFCONFIG.MODULE_NAME}.${PDFCONFIG.FLAG_CODE}"${value_code}/></div>`;

        html.find('div.picker').after(elem_offset + elem_code);
        // Add hook to allow drop of Actor or Item into the 'PDF Code' field
        html.find('.pageCode').on('dragover', false).on('drop', function (event) {
            event.preventDefault();
            event.stopPropagation();
            // TextEditor.getDragEventData requires event.dataTransfer to exist.
            const data = TextEditor.getDragEventData(event.originalEvent);
            console.log(`Dropped onto pagecode: ${data}`)
            if (!data) return;
            if (data.type === 'Actor' || data.type === 'Item') this.value = data.uuid;
        })
    } else {
        // Not editting, so maybe replace button with actual PDF
        let anchor = pagedoc.pdfpager_anchor;
        if (anchor || game.settings.get(PDFCONFIG.MODULE_NAME, PDFCONFIG.ALWAYS_LOAD_PDF)) {
            let rawlink=false;
            let pdf_slug="";
            if (typeof anchor === 'number')
                pdf_slug = `#page=${anchor + (pagedoc.getFlag(PDFCONFIG.MODULE_NAME, PDFCONFIG.FLAG_OFFSET) ?? 0)}`;
            else if (typeof anchor === 'string' && this.toc) {
                // convert TOC entry to PDFSLUG.
                // if the final slug is a string then it is an entry in the PDF's destination table.
                // if the final slug is an ARRAY, then we can't pass it as a parameter to viewer.html.
                let docslug = this.toc[anchor].pdfslug;
                let slug = JSON.parse(docslug);
                if (typeof slug === 'string') 
                    pdf_slug = `#nameddest=${slug}`;
                else {
                    // Pas array directly
                    pdf_slug = `#${docslug}`;
                    rawlink=true;
                }
                // In all likelihood the outline's array is likely to have an explicit zoom value anyway.
            }
            // If we are using a raw bookmark (rather than a named bookmark), then don't allow other parameters on the line
            if (!rawlink) {
                // Add configured zoom
                let default_zoom = game.settings.get(PDFCONFIG.MODULE_NAME, PDFCONFIG.DEFAULT_ZOOM);
                if (default_zoom && default_zoom !== 'none') {
                    console.log(`displaying PDF with default zoom of ${default_zoom}%`);
                    if (default_zoom === 'number') default_zoom = game.settings.get(PDFCONFIG.MODULE_NAME, PDFCONFIG.DEFAULT_ZOOM_NUMBER)
                    pdf_slug += (pdf_slug.length ? "&" : "#") + `zoom=${default_zoom}`;
                }
            }

            // Replace the "div.load-pdf" with an iframe element.
            // I can't find a way to do it properly, since html is simply a jQuery of top-level elements.
            //
            // Ideally it would simply involve html.closest('div.load-pdf').replaceWith(frame);

            let idx=-1;
            for (let i=0; i<html.length; i++)
                if (html[i].className == 'load-pdf') idx = i;
            if (idx==-1) return html;

            // as JournalPagePDFSheet#_onLoadPDF, but adding optional page-number
            const frame = document.createElement("iframe");
            frame.src = `scripts/pdfjs/web/viewer.html?${this._getViewerParams()}${pdf_slug}`;
            console.debug(frame.src);
            html[idx] = frame;
        }
    }

    // Register handler to generate the TOC after the PDF has been loaded.
    // (This is done in the editor too, so that the flag can be set as soon as a PDF is selected)
    html.on('load', async (event) => {
        //console.debug(`PDF frame loaded for '${pagedoc.name}'`);
        
        // Wait for PDF to initialise before attaching to event bus.
        this.pdfviewerapp = event.target.contentWindow.PDFViewerApplication;
        await this.pdfviewerapp.initializedPromise;

        // pdfviewerapp.pdfDocument isn't defined at this point
        // Read the outline and generate a TOC object from it.
        if (this.object.permission == CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) {
            this.pdfviewerapp.eventBus.on('outlineloaded', docevent => {   // from PdfPageView
                this.pdfviewerapp.pdfDocument.getOutline().then(outline => {
                    // Store it as JournalPDFPageSheet.toc
                    const oldflag = this.object.getFlag(PDFCONFIG.MODULE_NAME, PDFCONFIG.FLAG_TOC);
                    if (outline) {
                        let newflag = JSON.stringify(buildOutline(outline));
                        if (oldflag !== newflag) {
                            console.debug(`Storing new TOC for '${this.object.name}'`)
                            this.object.setFlag(PDFCONFIG.MODULE_NAME, PDFCONFIG.FLAG_TOC, newflag)
                            this._toc = outline;
                        }
                    } else if (oldflag !== undefined) {
                            this.object.unsetFlag(PDFCONFIG.MODULE_NAME, PDFCONFIG.FLAG_TOC);
                    }
                    //this.pdfviewerapp.pdfDocument.getDestinations().then(destinations => console.log("PDF Destinations =", destinations));
                })
                /* - working on ensuring window width is good
                // Set iframe width
                let iframe = event.target;
                // PDF.js sets div.textLayer to the actual width of the document (excluding PDF.js borders)
                let textLayer = iframe.contentWindow.document.body.querySelector('div.textLayer');
                console.log(textLayer);
                iframe.style.width = textLayer.scrollWidth + 'px';
                */
            })
            /*
            this.pdfviewerapp.eventBus.on('scalechanged', docevent => {   // from PdfPageView
                // docevent:
                //  source: Toolbar
                //  value:  either a numeric multiplier (1 = 100%, 1.5 = 150%) or a string ('page-fit', 'auto', 'page-actual'. 'page-width', 'page-height')
                console.log('scalechanged', docevent)
                // can also be read from this.pdfviewerapp.pdfViewer.currentScale
            })*/
        }
    })
    
    return html;
}

Hooks.on("renderJournalPDFPageSheet", function(sheet, html, data) {
    // Initialising the editor MUST be done after the button has been replaced by the IFRAME.
    if (!sheet.isEditable && game.settings.get(PDFCONFIG.MODULE_NAME, PDFCONFIG.FORM_FILL_PDF)) {
        const uuid = data.document.pdfpager_show_uuid || sheet.object.getFlag(PDFCONFIG.MODULE_NAME, PDFCONFIG.FLAG_CODE);
        initEditor(html, uuid || data.document.uuid);
    }
})

// Remove the flags we saved on the PAGE when the displayed window is closed.

Hooks.on("closeJournalSheet", (sheet, element) => {
    //console.log(`closing ${sheet.document.name}`)
    for (const node of sheet._pages) {
        if (node.type === 'pdf') {
            let page = sheet.getPageSheet(node._id)?.document;
            if (page) {
                delete page.pdfpager_anchor;
                delete page.pdfpager_show_uuid;
            }
        }
    }
})

Hooks.on("closeJournalPDFPageSheet", (sheet, element) => {
    //console.log(`closing PDF ${sheet.document.name}`)
    let page = sheet.document;
    delete page.pdfpager_anchor;
    delete page.pdfpager_show_uuid;
})

/**
 * An exact copy of JournalSheeet#_renderHeading from foundry.js,
 * with the only change to set MAX_NESTING depending on whether the page is a PDF or not.
 */

async function JournalSheet_renderHeadings(pageNode, toc) {
    const pageId = pageNode.dataset.pageId;
    const page = this.object.pages.get(pageId);
    const MAX_NESTING = (page.type == 'pdf') ? game.settings.get(PDFCONFIG.MODULE_NAME, PDFCONFIG.MAX_TOC_DEPTH) : 2;
    const tocNode = this.element[0].querySelector(`.directory-item[data-page-id="${pageId}"]`);
    if ( !tocNode || !toc ) return;
    const headings = Object.values(toc);
    if (foundry.utils.isNewerVersion (game.version, 12)) headings.sort((a, b) => a.order - b.order);
    if ( page.title.show ) headings.shift();
    const minLevel = Math.min(...headings.map(node => node.level));
    tocNode.querySelector(":scope > ol")?.remove();
    const tocHTML = await renderTemplate("templates/journal/journal-page-toc.html", {
      headings: headings.reduce((arr, {text, level, slug, element}) => {
        if ( element ) element.dataset.anchor = slug;
        if ( level < minLevel + MAX_NESTING ) arr.push({text, slug, level: level - minLevel + 2});
        return arr;
      }, [])
    });
    tocNode.innerHTML += tocHTML;
    tocNode.querySelectorAll(".heading-link").forEach(el =>
      el.addEventListener("click", this._onClickPageLink.bind(this)));
    this._dragDrop.forEach(d => d.bind(tocNode));
}

/**
 * my_journal_render reads the page=xxx anchor from the original link, and stores it temporarily for use by renderJournalPDFPageSheet later
 * Wraps JournalSheet#_render
 */
let webviewerloaded_set = false;

function JournalSheet_render(wrapper,force,options) {

    if (!webviewerloaded_set)
    {
        webviewerloaded_set=true;

        window.document.addEventListener("webviewerloaded", event => {
            //console.log("webviewerloaded", event, source);
            const source = event.detail.source;

            const always_ignore = game.settings.get(PDFCONFIG.MODULE_NAME, PDFCONFIG.IGNORE_BOOKMARK_ZOOM);
            const default_zoom  = game.settings.get(PDFCONFIG.MODULE_NAME, PDFCONFIG.DEFAULT_ZOOM);
            const ignore = always_ignore || (default_zoom && default_zoom !== 'none');

            console.log(`Setting ignoreDestinationZoom=${ignore}`);
            source.PDFViewerApplicationOptions.set("disablePreferences", true);
            source.PDFViewerApplicationOptions.set("ignoreDestinationZoom", ignore);
            // defaultZoomValue

            // scrollModeOnLoad
            let value = game.settings.get(PDFCONFIG.MODULE_NAME, PDFCONFIG.DEFAULT_SCROLL);
            source.PDFViewerApplicationOptions.set("scrollModeOnLoad", value);
            // spreadModeOnLoad
            value = game.settings.get(PDFCONFIG.MODULE_NAME, PDFCONFIG.DEFAULT_SPREAD);
            source.PDFViewerApplicationOptions.set("spreadModeOnLoad", value);
            // sidebarViewOnLoad
        });
    }

    // Monk's Active Tile Triggers sets the anchor to an array, so we need to check for a string here.
    let page  = this.object.pages.get(options.pageId);
    let ispdf = page?.type === 'pdf';
    if (!this.rendered && ispdf) {
        delete page.pdfpager_anchor;
        delete page.pdfpager_show_uuid;
    }
    if (options.anchor && 
        typeof options.anchor === 'string' &&
        ispdf) {
        console.log(`render: ${JSON.stringify(options)}`)
        page.pdfpager_anchor = options.anchor?.startsWith('page=') ? +options.anchor.slice(5) : decodeURIComponent(options.anchor);
        delete options.anchor;   // we don't want the wrapper trying to set the anchor
    }
    if (options.showUuid) {
        console.log(`rendering for Document '${options.showUuid}'`)
        page.pdfpager_show_uuid = options.showUuid;
        delete options.showUuid;
    }
    return wrapper(force,options);
}


/**
 * 
 * @param {*} pdfcode The short code of the PDF page to be displayed
 * @param {*} options Can include {page: <number>}  and/or { pdfcode: <code> } and/or { showUuid : <docid> }
 */
 export function openPDFByCode(pdfcode, options={}) {
    if (!options) options = {};
    console.log(`openPDFByCode('${pdfcode}', '${JSON.stringify(options)}')`);

    const pagedoc = getPDFByCode(pdfcode);
    // Stop now if no page was found
    if (pagedoc) {
        const journalsheet = pagedoc.parent.sheet;
        // Render journal entry showing the appropriate page (JournalEntryPage#_onClickDocumentLink)
        if (!options?.uuid && options.page &&
            journalsheet?._state === Application.RENDER_STATES.RENDERED &&
            journalsheet._pages[journalsheet.pageIndex]?._id === pagedoc.id &&
            updatePdfView(journalsheet.getPageSheet(pagedoc.id), `page=${options.page}`)) {
            // We updated the already displayed PDF document
            return;
        } else {
            // updatePdfView didn't do the work, so do it here instead.
            let pageoptions = { pageId : pagedoc.id };
            if (options?.page) pageoptions.anchor = `page=${options.page}`;
            if (options?.uuid) pageoptions.showUuid = options.uuid;
            pagedoc.parent.sheet.render(true, pageoptions);
        }
    } else {
        console.error(`openPdfByCode: unable to find PDF with code '${pdfcode}'`)
        ui.notifications.error(game.i18n.localize(`${PDFCONFIG.MODULE_NAME}.Error.NoPDFWithCode`))
    }
}


export function deleteOutlines() {
    if (!game.user.isGM) {
        ui.notifications.warn(game.i18n.format(`${PDFCONFIG.MODULE_NAME}.Warning.OnlyGM`, {function:"deleteOutlines()"}));
        return;
    }
    for (const journal of game.journal) {
        for (const page of journal.pages) {
            if (page.getFlag(PDFCONFIG.MODULE_NAME, PDFCONFIG.FLAG_TOC)) {
                console.log(`Removed stored Outline for '${page.name}' in '${journal.name}'`)
                page.unsetFlag(PDFCONFIG.MODULE_NAME, PDFCONFIG.FLAG_TOC);
                if (page._toc) page._toc = null;
            }
        }
    }
}