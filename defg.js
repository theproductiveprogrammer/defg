#!/usr/bin/env node
//** # DEFG - Beautiful Documentation from Code Comments
//**
//** ## Motivation
//**
//** I find that README's and other documentations tend to get out of
//** date quickly. `defg` generates a README from documentation
//** comments, and as these comments are close
//** to the code, they are be easier to access, modify, and update.
//**
//** ## How does it work?
//**
//** `defg` trawls through all 'programming' files (.js, .sh, .java, .c, .cpp,...)
//** it finds and extracts 'special' comments that start with `//**` or `##**`.
//** These are considered 'user documentation' comments in markdown.
//** It then uses them to update the README, generate a nice PDF, and opens it.
//**
//** ## First Run
//**
//** If you run `defg` and there is no README.md file, it will generate one from
//** all the documentation it has found. During this process, it can get the order
//** of comments all mixed up. You are encouraged to then go and reorder all the
//** pieces in the README.md to get it into a nice shape.
//**
//** ## Improving the README
//**
//** You can also update your README to make it more readable. You can:
//**
//** 1. Add pictures.
//** 2. Add styling.
//** 3. Add text.
//** 4. Configure the page layout.
//**
//** As you do all these, `defg` will preserve your changes whenever it updates your README.
//**
//** ### HOW TO IMPROVE THE README
//**
//** - You can add images in markdown or using the `<img..` tag. Similarily,
//**   you can add other HTML styling in the document to improve it's look.
//**
//** - For better control on your styling you can add a README.css which will
//**   apply the CSS styles to your README while generating the PDF.
//**
//** - To insert additional text in the README, wrap the additional text
//**   in a `<div class="insert-block">...</div>`.
//**
//** - To insert a page break insert a `<div class="page-break" />` and add the style to your CSS:
//**   ```css
//**   .page-break {
//**     page-break-after: always
//**   }
//**
//** - To design the page layout, create a `pages.defg` file. Here you can decide the page
//**   size, header & footer using the following Puppeteer options: https://pptr.dev/api/puppeteer.pdfoptions
//**   ```
//**   format: A4
//**   margin: 20mm 20mm
//**   printBackground: true
//**   headerTemplate: |-
//**     <style>
//**       .header, .footer {
//**         width: calc(100% - 30mm);
//**         margin: 0 auto;
//**         text-align: left;
//**         font-family: system-ui;
//**         font-size: 6px;
//**         padding: 4px;
//**       }
//**       .header {
//**         border-bottom: 1px solid #333;
//**       }
//**       .footer {
//**         border-top: 1px solid #333;
//**         text-align: center;
//**       }
//**       .date {
//**         display: block;
//**         float: right;
//**       }
//**     </style>
//**     <div class="header">
//**        <span>My Document</span>
//**        <span class="date"></span>
//**     </div>
//**   footerTemplate: |-
//**     <div class="footer">
//**         Page <span class="pageNumber"></span>
//**         of <span class="totalPages"></span>
//**     </div>
//**   ```
//**
//**
//** ## Usage
//** ```
//** $> defg
//**   # ensures README contains all 'user documentation' comments (//** or ##** comments)
//**   # and then generates and opens a PDF with the user documentation
//**
//** Options
//**    -h, --help:     show help
//**    -v, --version:  show version
//**    --src:          path of source files (or path of a single source file)
//**    --readme:       path of README file to check (./README.md by default)
//**    --style:        path of CSS file containing stying (./README.css by default)
//**    --pdf:          path of pdf generated (./README.pdf by default)
//**    --ext:          list of valid source file extensions (js,py,java,sql,ts,sh,go,c,cpp by default)
//**    --ignore-src:   ignore source and just generate from readme
//** ```
const fs = require('fs')
const path = require('path')
const { mdToPdf } = require('md-to-pdf')
const { exec } = require('child_process')
const arg = require('arg')
const { version } = require('./package.json')

const Diff = require('diff')
const chalk = require('chalk')

const matter = require('gray-matter')

/*    understand/
 * main entry point into our program
 *
 *    way/
 * find all user documentation comments and check them against
 * the README.md. Display any not found or, if all found, open
 * the README as pdf.
 */
function main() {
  const args = arg({
    '--help': Boolean,
    '--version': Boolean,
    '--src': String,
    '--readme': String,
    '--style': String,
    '--pdf': String,
    '--ext': [ String ],
    '--ignore-src': Boolean,

    '-h': '--help',
    '-v': '--version',
    '-e': '--ext',
  })
  if(args['--help']) return showHelp()
  if(args['--version']) return showVersion()

  const ctx = {
    readme: args['--readme'] || 'README.md',
    src: args['--src'] || '.',
    exts: args['--ext'] || ['js,py,java,sql,ts,sh,go,c,cpp'],
    page_options: 'page.defg',
  }
  ctx.exts = ctx.exts.join(',').split(',').map(e => '.' + e.trim())
  ctx.pdf = args['--pdf'] || path.join(path.dirname(ctx.readme), path.basename(ctx.readme, '.md') + '.pdf')

  if(args['--style']) ctx.style = args['--style']
  else if(fs.existsSync("README.css")) ctx.style = "README.css"

  const readme = readreadme(ctx)
  if(args['--ignore-src']) {
    openPDF(ctx)
  } else {
    const docblocks = xtractUserDocz(ctx)
    if(!docblocks) {
      console.log("No documentation comments found...")
      console.log("Documentation comments are single line comments that start with \/\/** or \#\#**")
      openPDF(ctx)
      return
    }

    if(readme == null) {
      saveReadme(ctx, asDiff(docblocks))
    } else {
      regen_readme(ctx, readme, docblocks)
    }
  }
}

function asDiff(docblocks) {
  let diff = []
  docblocks.map(block => {
    diff = diff.concat(block.map(value => {
      value += "\n"
      return { fresh: true, value }
    }))
  })
  return diff
}

/*    way/
 * Find the closest of all permutations of the docblocks
 * and apply that to the README, trying to preserve images already
 * in the README.
 */
function regen_readme(ctx, readme, docblocks) {
  const n = docblocks.length
  const chosen = []
  const perm = []
  const dists = []

  const rlines = readme.split(/[\r\n]/g)

  const min = { dist: null, data: null }
  gen_1(find_min_1)

  const data = min.data.join("\n").trim()
  const diff = Diff.diffLines(readme, data, { ignoreWhitespace: false, newlineIsToken: false })

  saveReadme(ctx, diff)

  function gen_1(cb) {
    if(perm.length == n) return cb()
    for(let i = 0;i < n;i++) {
      if(chosen[i]) continue;
      chosen[i] = true
      perm.push(docblocks[i])
      gen_1(cb)
      perm.pop()
      chosen[i] = false
    }
  }

  /*    way/
   * walk both data and readme in lockstep, inserting special lines from the README into non-matching
   * data (looking 'n' lines ahead for a reasonable match)
   */
  function find_min_1() {
    let data = []
    perm.map(block => data = data.concat(block))
    let nd = 0
    let nr = 0
    let dist = 0
    while(nd < data.length && nr < rlines.length) {
      const ld = data[nd]
      const lr = rlines[nr]
      if(ld === lr) {
        nd++
        nr++
        continue
      }
      if(!ld || isSplLine(ld)) {
        nd++
        continue
      }
      if(!lr || isSplLine(lr)) {
        nr++
        data.splice(nd, 0, lr)
        nd++
        continue
      }
      const maxLookAhead = 7
      let i = 1;
      for(;i < maxLookAhead;i++) {
        const ld_ = data[nd+i]
        const lr_ = rlines[nr+i]
        if(lr_ === ld) {
          dist += i
          nr += i
          break
        }
        if(ld_ === lr) {
          dist += i
          nd += i
          break
        }
      }
      if(i == maxLookAhead) {
        dist += 2
      }
      nd++
      nr++
      if(min.dist != null && dist > min.dist) return
    }
    dists.push(dist)
    min.dist = dist
    min.data = data
  }
}

function isSplLine(l) {
  return l.match(/^[ \t]*[!]\[.*\]\([^)]*\)[ \t\n]*$/) || l.match(/^[ \t]*<.*>[ \t\n]*$/)
}


function showHelp() {
  console.log(`$> defg
  # ensures README contains all 'user documentation' comments (${"//"}** or ${"##"}** comments)
  # and then generates and opens a PDF with the user documentation

Options
   -h, --help:     show help
   -v, --version:  show version
   --src:          path of source files (or path of a single source file)
   --readme:       path of README file to check (./README.md by default)
   --style:        path of CSS file containing stying (./README.css by default)
   --pdf:          path of pdf generated (./README.pdf by default)
   --ext:          list of valid source file extensions (js,py,java,sql,ts,sh,go,c,cpp by default)
   --ignore-src:   ignore source and just generate from readme
`)
}
function showVersion() {
  console.log(version)
}

function readreadme(ctx) { return readsafely(ctx.readme); }

function readpageoptions(ctx) {
  let page_options = readsafely(ctx.page_options);
  if(!page_options) return

  if(!page_options.match(/^[ \t]/)) {
    page_options = page_options.split(/[\r\n]/g).map(l => '  ' + l).join("\n");
  }

  const front = matter(`---
${page_options}
---
  `)

  if(front) return front.data
}

/*    way/
 * safely read a file
 */
function readsafely(f) {
  try {
    return fs.readFileSync(f, 'utf8').trim()
  } catch(e) {
    if(e.code === 'ENOENT') return null
    throw e
  }
}

/*    way/
 * safely read the readme file
 */
function read(ctx) {
  try {
    return fs.readFileSync(ctx.readme, 'utf8').trim()
  } catch(e) {
    if(e.code === 'ENOENT') return null
    throw e
  }
}

/*    way/
 * extract user documentation comment lines from
 * all javascript files, ignoring some common directories (node_modules etc)
 */
function xtractUserDocz(ctx) {
  const docblocks = []

  const stat = fs.lstatSync(ctx.src)
  if(stat && stat.isFile()) xtract_1(ctx.src, docblocks)
  else x_1(ctx.src)
  if(docblocks.length) return docblocks

  function x_1(p) {
    const ntries = fs.readdirSync(p, { withFileTypes: true })
    ntries.map(ntry => {
      if(ntry.isDirectory() && is_ok_1(ntry.name)) return x_1(path.join(p, ntry.name))
      if(!ntry.isFile()) return
      if(!ntry.name) return
      let m = false
      ctx.exts.map(ext => {
        if(ntry.name.endsWith(ext)) m = true
      })
      if(m) xtract_1(path.join(p, ntry.name), docblocks)
    })
  }

  function is_ok_1(n) {
    if(!n) return
    if(n === 'node_modules') return
    if(n.startsWith('.')) return
    if(n === 'dist') return
    if(n === 'tmp' || n === '_tmp') return

    return true
  }

  /*    understand/
   * extract all the comments in files in blocks so they can be
   * re-arranged.
   * Eg:
   *   file1.js:
   *      comment1
   *      comment1
   *      ...
   *      comment2
   *      comment2
   *   file2.js:
   *      ...
   *      comment3
   *      comment3
   *
   * will be extracted as:
   *    [
   *      ["comment1", "comment1"],
   *      ["comment2", "comment2"],
   *      ["comment3", "comment3"],
   *    ]
   *
   *      way/
   * Add each documentation line to an active docblock list, closing the
   * existing active list whenever we find a non-documentation
   * line and creating a new one when needed.
   */
  function xtract_1(f, docblocks) {
    let active = null

    const data = fs.readFileSync(f, "utf8")
    const lines = data.split(/[\r\n]/g)
    lines.map(l => {
      const doc = xtract_doc_comment_1(l)
      if(doc === null) {
        active = null
      } else {
        if(!active) {
          active = []
          docblocks.push(active)
        }
        active.push(doc)
      }
    })
  }

  function xtract_doc_comment_1(l) {
    let m
    m = l.match(/[/#][/#]\*\* ?$/)
    if(m) return ""
    m = l.match(/[/#][/#]\*\* (.*)/)
    if(m) return m[1]
    return null
  }
}

function saveReadme(ctx, diff) {
  const o = []
  for(let i = 0;i < diff.length;i++) {
    const part = diff[i]
    if(part.fresh) {
      console.log(chalk.magenta(part.value.trim()))
      o.push(part.value);
    } else if(part.removed) {
      console.log(chalk.red('xxx '+part.value.trim()+' xxx'))
    } else if(part.added) {
      console.log(chalk.blue(part.value.trim()))
      o.push(part.value);
    } else {
      console.log(chalk.grey(part.value.trim()))
      o.push(part.value);
    }
  }
  const data = o.join("").trim()
  fs.writeFile(ctx.readme, data, err => {
    if(err) console.error(err)
    else openPDF(ctx);
  })
}

/*    way/
 * generate and open pdf
 */
async function openPDF(ctx) {
  if(!fs.existsSync(ctx.readme)) {
    console.log(`${ctx.readme} not found to open!`)
    return
  }

  const readme = readreadme(ctx)
  const page_options = readpageoptions(ctx)

  const options = { dest: ctx.pdf }
  if(ctx.style) options.stylesheet = ctx.style
  if(page_options) options.pdf_options = page_options
  options.pdf_options.displayHeaderFooter = true

  await mdToPdf({ path: ctx.readme }, options).catch(console.error)

  openItem(ctx.pdf)
}

/*    way/
 * call the default open application based on platform
 */
function openItem(n) {
  switch (process.platform) {
    case 'darwin' : return exec('open ' + n)
    case 'win32' : return exec('start ' + n)
    case 'win64' : return exec('start ' + n)
    default : return exec('xdg-open ' + n)
  }
}

main()
