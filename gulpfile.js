// TODO: Deprecate usage of gulpjs altogether.

const gulp = require('gulp');
const path = require('path');
const { exec } = require('child_process');

const SYNTAX_TASK = (() => {
    const TASK_NAME = 'compileSyntax';

    const dir = 'syntaxes/';
    const languagePath = path.join(dir, 'UnrealScript.YAML-tmLanguage');
    const ppLanguagePath = path.join(dir, 'unrealscript.preprocessor.YAML-tmLanguage');

    gulp.task(TASK_NAME, (done) => {
        // We could use js-yaml directly, but I would prefer to deprecate gulpjs altogether instead.
        exec('npm run compile:syntax', (err, stdout, stderr) => {
            console.log(stdout);
            console.error(stderr);
            done();
        });
    });

    if (process.env.NODE_ENV === 'development') {
        const FILES_TO_WATCH = [ppLanguagePath, languagePath];
        gulp.watch(FILES_TO_WATCH, (cb) => {
            return gulp.task(TASK_NAME)(cb);
        });
    }

    return TASK_NAME;
})();

const GRAMMAR_TASK = (() => {
    const TASK_NAME = 'buildGrammar';

    const dir = 'grammars/';
    const lexerPath = path.join(dir, 'UCLexer.g4');
    const parserPath = path.join(dir, 'UCParser.g4');
    const ppParserPath = path.join(dir, 'UCPreprocessorParser.g4');

    gulp.task(TASK_NAME, (done) => {
        /* `cd node_modules/antlr4ts-cli && antlr4ts -visitor ${GRAMMAR_PATH} -o server/src/antlr` */
        exec('npm run compile:grammar', (err, stdout, stderr) => {
            console.log(stdout);
            console.error(stderr);
            done();
        });

        exec('npm run compile:preprocessor', (err, stdout, stderr) => {
            console.log(stdout);
            console.error(stderr);
            done();
        });
    });

    if (process.env.NODE_ENV === 'development') {
        const FILES_TO_WATCH = [lexerPath, parserPath, ppParserPath];
        gulp.watch(FILES_TO_WATCH, (cb) => {
            return gulp.task(TASK_NAME)(cb);
        });
    }

    return TASK_NAME;
})();

// Copy all the UnrealScript presets to the 'out' directory
const PRESETS_TASK = (() => {
    const TASK_NAME = 'copy presets';
    const filesGlob = 'server/src/presets/**/*.uc';

    gulp.task(TASK_NAME, (done) => {
        return gulp
            .src(filesGlob)
            .pipe(gulp.dest(path.join(__dirname, 'out', 'presets/')));
    });

    if (process.env.NODE_ENV === 'development') {
        const FILES_TO_WATCH = [filesGlob];
        gulp.watch(FILES_TO_WATCH, (cb) => {
            return gulp.task(TASK_NAME)(cb);
        });
    }

    return TASK_NAME;
})();


const DEBUGGER_TASK_CLEAR = (() => {
    const TASK_NAME = 'clear debugger';

    gulp.task(TASK_NAME, (done) => {
        exec("npx rimraf unrealscript-debugger/target --preserve-root ", (err, stdout, stderr) => {
            console.log(stdout);
            console.error(stderr);
            done();
        });
    })

    return TASK_NAME;
})();

const DEBUGGER_TASK_BUILD = (() => {
    const TASK_NAME = 'build debugger';
    const buildCmd = "cd unrealscript-debugger && cargo build --release --target ";

    const build = (targetName, done) => {
        let hasError = false;
        const shell = exec(buildCmd + targetName, (err, stdout, stderr) => {
            done();
        });
        shell.stdout.on("data", (data) => {
            console.log(data);
        });
        shell.stderr.on("data", data => {
            if (hasError) {
                console.error(data);
                return;
            }
            if (String(data).startsWith("error")) {
                console.error(data);
                hasError = true;
                return;
            }
            console.log(data);
        });
    }
    const buildX86 = (done) => {
        const targetName = "i686-pc-windows-msvc";
        build(targetName, done);
    }

    const buildX64 = (done) => {
        const targetName = "x86_64-pc-windows-msvc";
        build(targetName, done);
    }

    gulp.task(TASK_NAME, gulp.series(
        buildX86,
        buildX64,
    ))
    return TASK_NAME;
})();

const DEBUGGER_TASK_COPY = (() => {
    const TASK_NAME = 'copy debugger bin';

    const filesGlobX86 = [
        'unrealscript-debugger/target/i686-pc-windows-msvc/release/adapter.exe',
        'unrealscript-debugger/target/i686-pc-windows-msvc/release/interface.dll',
    ];

    const filesGlobX64 = [
        'unrealscript-debugger/target/x86_64-pc-windows-msvc/release/adapter.exe',
        'unrealscript-debugger/target/x86_64-pc-windows-msvc/release/interface.dll',
    ];


    gulp.task(TASK_NAME, gulp.series(
        () => {
            return gulp.src(filesGlobX86).pipe(gulp.dest(path.join(__dirname, 'out', 'bin/win32/')))
        },
        () => {
            return gulp.src(filesGlobX64).pipe(gulp.dest(path.join(__dirname, 'out', 'bin/win64/')))
        }
    ))

    return TASK_NAME;
})();

gulp.task('default', gulp.series([
    GRAMMAR_TASK,
    SYNTAX_TASK,
    PRESETS_TASK,
    // DEBUGGER_TASK_CLEAR, // jump clear to speed up pack
    DEBUGGER_TASK_BUILD,
    DEBUGGER_TASK_COPY,
]));
