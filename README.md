[![ko-fi](https://img.shields.io/badge/Ko--Fi-farling-success)](https://ko-fi.com/farling)
[![patreon](https://img.shields.io/badge/Patreon-amusingtime-success)](https://patreon.com/amusingtime)
[![paypal](https://img.shields.io/badge/Paypal-farling-success)](https://paypal.me/farling)
![GitHub License](https://img.shields.io/github/license/farling42/fvtt-pdf-pager)
![Foundry Info](https://img.shields.io/badge/Foundry-v10-informational)
![Latest Release Download Count](https://img.shields.io/github/downloads/farling42/fvtt-pdf-pager/latest/module.zip)

# PDF Pager

This module provides the following:

- Configuration option to automatically load a PDF into a page as soon as the page is displayed.
- Include `#page=xxx` as a suffix on the document link to open a PDF document at the requested page.
- Include a page offset in the PDF document definition, so that `page=xxx` can reference the book's page numbering (some PDFs have extra pages before page 1).
- Supports the existing `@PDF[name]{label}`   but the page name must have the same name as the journal.
- Provide additional syntax of `@PDF[journalname#pagename|page=xx]{label}` to allow PDFs to be displayed in a page whose name does not match the journal name.
- Automatically migrates PDFoundry PDF information to new PDF pages in journals (if the journal does not have any other pages already in it).
- An option to automatically create a `@PDF[journalname#pagename|page=xx]{pagename}` link when dropping a journal PDF page into another document.
- Provide an Actor sheet called 'PDF Sheet' which can be used to replace the existing Actor sheet with a PDF document.
- Provide an option to load current values stored in a fillable PDF into an associated Actor/Item.

## Example

Showing a link to an existing PDF page within a journal entry, and specifying that the link will open the PDF at page 10:

```text
@UUID[JournalEntry.T29aMDmLCPYybApI.JournalEntryPage.iYV6uMnFwdgZORxi#page=10]{label}
@PDF[name|page=xxx]{label}            <note that the journal and page must both match the single 'name'>
@PDF[journalname#pagename|page=xxx]{label}
```

Note the use of `#page=10` with a `@@UID`, and the use of `|page=10` with a `@PDF` link.

## Installation

The module is available from the Foundry Module Management window, just search for "PDF Pager", or it can be manually added with the following link:

https://github.com/farling42/fvtt-pdf-pager/releases/latest/download/module.json

## Utility Function

A new function is available for modules to use which will open a PDF using a short-code defined for that specific PDF (e.g. "DMG" or "PHB"). There are two optional parameters:

- Specify a specific page within the PDF to open
- Specify the UUID of an Actor or Item to display in the Form Fillable PDF

```js
ui.pdfpager.openPDFByCode("PHB")
ui.pdfpager.openPDFByCode("DMG", { page : 30 } )
ui.pdfpager.openPDFByCode("SHEET", { uuid: 'Actor.CY4zUd7qYUeer3d4' } )
```

## Migrating from PDFoundry

Function are available which can be called directly from a macro script or from the console command-line to migrate your existing PDFoundry documents and links to the new format.

### migratePDFoundry()

This function creates a page in each journal entry containing the information previously configured using PDFoundry for each PDF.

This function also automatically migrates FormData which might have been present on Actors used with the PDFoundry module.

It takes a single optional parameter which is an object that can contain the single boolean field 'onlyIfEmpty', which if set will only migrate PDFoundry journal entries which currently have no pages.

```js
ui.pdfpager.migratePDFoundry()
ui.pdfpager.migratePDFoundry( { onlyIfEmpty:true } )
```

The second version is triggered automatically on starting the game (or enabling the module).

### replacePDFlinks

If you no longer want to have `@PDF[name]` links in your documents, a function is provided to convert them to the Foundry V10 standard format of `@UUID[longuuid]` format.

The new link will be to a Journal Entry called "bookname" (see OLD syntax below), and one of the PDF pages inside that journal entry: either a PDF page called "bookname" otherwise the first PDF page in that journal entry.

OLD: `@PDF[bookname|page=xxx]{label}`

NEW: `@UUID[full-uid-to-pdf-page#page=xxx]{label}`

```js
ui.pdfpager.replacePDFlinks()
```

### Form Fillable PDFs

To use Form Fillable PDFs, a PDF page should be set up in a Journal, and the "PDF Code" in the PDF Editor should be set to the ID of the associated Actor or Item. For ease of use, dragging an Actor or Item onto the "PDF Code" page will insert the UUID for that document.

The module settings window allows you to set up manual mappings between a PDF field and a field in the linked Actor/Item. Any field which is not mapped to a specific field will be stored in the Actor/Item in a hidden field.

The "PDF Sheet" can be chosen for an Actor to show a PDF instead of the system's default character sheet. The specific PDF document for each actor type can be configured in the module settings. The storage of information from that PDF will be processed in the same way as for Journal PDF Pages.

#### Opening an Actor or Item in a predefined PDF

In the module settings, it is possible to set up a PDF Code for each type of Actor and Item, this will then present an additional entry in the context menu when selecting an Actor or Item in the sidebar. This additional entry will open the selected Actor/Item in the PDF document which has the configured PDF Code.

### Loading an existing filled PDF into a Foundry Actor/Item

There is a module option ("Read Fields from PDF") which can be enabled temporarily so that when a PDF file is opened then any filled fields within that PDF file will be transferred to the Actor/Item associated with that PDF within Foundry.

Editing in the PDF window is disabled while this option is enabled, so that users don't mistakenly start making changes to an Actor/Item via this window, which will get overwritten the next time that the window is opened while this option is enabled.

#### Accessing data stored in hidden fields

If you want to access the 'hidden' fields in macros or other modules, each field is stored on the Actor as `flags['pdf-pager'].fieldText['nameoffield']`  (where 'nameoffield' is the name of the field in the PDF (if the PDF field has no name, then it's id will be used instead).

#### Setting up the Mapping to existing Actor/Item fields

There are two methods of configuring the mapping between Actor/Item fields and the PDF fields:

- a preconfigured file supplied by the module in the module/pdf-pager/systems folder (an example for the dnd5e game system is provided).
- a manual create Javascript object entered into the Field Mappins for Actors/Items field of the Module Settings window within Foundry.
- call one of both of the functions from a macro which will define the relevant mapping: `ui.pdfpager.registerActorMapping` or `ui.pdfpager.registerItemMapping`

#### Format of the mapping object

An example of using registerActorMapping to provide a mapping from PDF-field name to Actor field name.

```js
  {
     "CharacterName": "name",
     "STR": "system.abilities.str.value",
     "DEX": "system.abilities.dex.value",
     "CON": "system.abilities.con.value",
     "INT": "system.abilities.int.value",
     "WIS": "system.abilities.wis.value",
     "CHA": "system.abilities.cha.value",
     "STRmod": "system.abilities.str.mod",
     "DEXmod": "system.abilities.dex.mod",
     "CONmod": "system.abilities.con.mod",
     "INTmod": "system.abilities.int.mod",
     "WISmod": "system.abilities.wis.mod",
     "CHamod": "system.abilities.cha.mod"
  }
```

If there is a complex mapping for a field in the PDF, then the entry in the mapping can be defined as an object with the following functions:

- A `getValue(actor)` function that returns a string which will be the value put into the PDF field.
- An optional `setValue(actor,value)` function which is called when the user changes a value in the field. `value` contains the value that the user entered, and the setValue function is responsible for calling `actor.update()` with the relevant updates.

A simple example to convert a Boolean stored in the Actor record into a string ("Y") displayed in the PDF field.

```js
export let actormap = {
    "Inspiration": { // "system.attributes.inspiration"
        getValue(actor) {
            return actor.system.attributes.inspiration ? "Y" : "";
        },
        setValue(actor, value) {
            actor.update( { ["system.attributes.inspiration"] : (value?.length > 0) })
        }
    },
}
```

Feel free to forward me any system-specific .mjs files which you've created for inclusion in the systems folder.

### Translations

Feel free to submit a pull request or an issue containing translations for the entries in the en.json file.
