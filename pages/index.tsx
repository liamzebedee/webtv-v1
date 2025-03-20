import Editor, { DiffEditor, useMonaco, loader } from '@monaco-editor/react';
import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import styles from '../styles/index.module.css';

const TVSCRIPT_LANG = `tvScript`
const characters = 'Narrator Rick Morty Trump'.split(' ')
const sampleScript = `Narrator: rick and morty go to the aus buildor meetup
[Morty walks to Center Stage]
Rick: morty
Morty: rick
Trump: tariffs

// Narration
// Narrator: rick and morty do something terrible with javascript

// Dialogue
// Rick: morty
// Morty: rick
// Trump: tariffs

// Camera angles:
// {Wide shot}
// {Long shot, Rick and Morty}
// {Close up, Rick}
// {Close up, Morty}
//
// Stage directions:
// [Morty walks to Center Stage]
// [Rick and Morty enter the portal to Banana Land]
`


let VIDEO_SERVER = `http://localhost:8512/outputs/`
let GENERATION_SERVER = 'http://localhost:8512';

// tailscale serve --bg --set-path /video-server http://127.0.0.1:9000 
// tailscale serve --bg --set-path /generation-server http://127.0.0.1:8512
// tailscale funnel 443 on 
// if (process.env.NODE_ENV == 'production') {
// if(true) {
//     VIDEO_SERVER = `https://acmay.tail989c9.ts.net/video-server`
//     // GENERATION_SERVER = 'https://acmay.tail989c9.ts.net/generation-server'
//     GENERATION_SERVER = `https://spicy-bats-learn.loca.lt`
// }

console.log(`VIDEO_SERVER: ${VIDEO_SERVER}`)
console.log(`GENERATION_SERVER: ${GENERATION_SERVER}`)

const App = () => {
    const editorRef = useRef(null);
    const [generateStatus, setGenerateStatus] = useState(null)
    // const [videoSrc, setVideoSrc] = useState(`${VIDEO_SERVER}/eee05274-513d-e8c2-1bca-45e29fb2b573.mp4.mp4`)
    const [videoSrc, setVideoSrc] = useState(``)
    const [msg, setMsg] = useState('')
    const videoRef = useRef<HTMLVideoElement>();
    useEffect(() => {
        if (videoRef.current)
            videoRef.current.load();
    }, [videoSrc]);



    function handleEditorDidMount(editor, monaco) {
        editorRef.current = editor;

        var language = {
            defaultToken: '',
            tokenizer: {
                // NOTE: Order matters here.
                root: [
                    // Comments (e.g., /* comment */ or // comment)
                    [/\b(comment)\b/, 'comment'],
                    [/(\/\/[^\n]*)/, 'comment'],  // Single-line comment (//)
                    [/(\/\*[\s\S]*?\*\/)/, 'comment'],  // Multi-line comment (/* */)

                    // Camera Direction
                    [/^\{[^}]*\}/, 'camera-direction'],

                    // Stage Direction
                    [/^\[[^\]]*\]/, 'stage-direction'],

                    // Dialogue
                    [/^([^:]+):/, 'character-name'],
                    [/:(.*)$/, 'speech'],
                ]
            }
        };

        monaco.languages.register({ id: TVSCRIPT_LANG });
        monaco.languages.setMonarchTokensProvider(TVSCRIPT_LANG, language);

        monaco.editor.defineTheme('myCustomTheme', {
            base: 'vs', // can also be vs-dark or hc-black
            inherit: true, // can also be false to completely replace the base rules
            rules: [
                { token: 'character-name', foreground: '222222', fontStyle: 'bold' },
                { token: 'speech', foreground: '008000' },
                { token: 'stage-direction', foreground: '0000FF', fontStyle: 'italic' },
                { token: 'camera-direction', foreground: 'A020F0', fontStyle: 'underline' },
                { token: 'comment', foreground: '888888' },
            ],
            colors: {
                // you can also define editor colors here
            }
        });

        monaco.languages.registerCompletionItemProvider(TVSCRIPT_LANG, {
            provideCompletionItems: function (model, position) {
                var suggestions = [
                    // { label: 'Rick', insertText: 'Rick: ', kind: monaco.languages.CompletionItemKind.Text },
                    // { label: 'Morty', insertText: 'Morty: ', kind: monaco.languages.CompletionItemKind.Text },
                    ...characters.map(function (character) {
                        return {
                            label: character,
                            kind: monaco.languages.CompletionItemKind.Text,
                            insertText: character + ': ',
                        };
                    })
                ];
                return { suggestions: suggestions };
            }
        });

        monaco.languages.registerOnTypeFormattingEditProvider(TVSCRIPT_LANG, {
            autoFormatTriggerCharacters: ['{', '['],
            provideOnTypeFormattingEdits: function (model, position, ch) {
                if (ch === '{') {
                    return [{ range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column), text: '{}', forceMoveMarkers: true }];
                }
                if (ch === '[') {
                    return [{ range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column), text: '[]', forceMoveMarkers: true }];
                }
            }
        });

        // To set the theme
        monaco.editor.setTheme('myCustomTheme');

        // disable minimap
        editor.updateOptions({ 
            wordWrap: 'on',
            minimap: { enabled: false },
            // lineNumbersMinChars: 1,
            // lineNumbers: "off",
            glyphMargin: false,
            roundedSelection: false,
            scrollBeyondLastLine: false,
        });

        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Slash, () => {
            const selection = editor.getSelection();
            const model = editor.getModel();
            const lines = model.getLinesContent();

            let startLine = selection.selectionStartLineNumber;
            let endLine = selection.selectionEndLineNumber;

            let newLines = [...lines];
            for (let i = startLine - 1; i < endLine; i++) {
                // Check if the line starts with comment syntax
                if (lines[i].trim().startsWith('//')) {
                    // Uncomment: remove the '//' at the start
                    newLines[i] = newLines[i].substring(2);
                } else {
                    // Comment: add '//' at the start
                    newLines[i] = '//' + newLines[i];
                }
            }

            // Apply changes to the model
            model.setLinesContent(newLines);
        });
    }


    async function clickGenerate() {
        console.log('click generate')


        // Strip comments from script.
        function parseScript(script) {
            let s2 = "";
            for (let line of script.split('\n')) {
                if (line.trim().startsWith('//')) {
                    continue;
                }
                s2 += line + '\n';
            }
            return s2;
        }

        const script = parseScript(editorRef.current.getValue())
        setGenerateStatus('generating')
        
        // fetch this endpoint
        /*
        DATA=$(jq -n --arg scriptContents "$(cat script.txt)" '{"script": $scriptContents}')
        curl -X POST "http://localhost:8512/scenes/generate" \
        -H "Content-Type: application/json" \
        -d "$DATA"
        */

        const body = JSON.stringify({
            script,
            author: "llama69"
        })
        console.log(`sending`, body)
        const res = await fetch(`${GENERATION_SERVER}/scenes/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body,
        })

        const data = await res.json()
        console.log(`response:`)
        console.log(data)
        const { sceneId } = data

        const fname = `${sceneId}.mp4.mp4`
        const videoUrl = `${VIDEO_SERVER}${fname}`
        console.log(`video url: ${videoUrl}`)
        setVideoSrc(videoUrl)
        setGenerateStatus(null)
        setMsg(`Generated ${fname}`)
    }

    return <div className={styles.index}>
        <Head>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/twitter-bootstrap/2.3.2/css/bootstrap.css" integrity="sha512-Fik9pU5hBUfoYn2t6ApwzFypxHnCXco3i5u+xgHcBw7WFm0LI8umZ4dcZ7XYj9b9AXCQbll9Xre4dpzKh4nvAQ==" crossOrigin="anonymous" referrerPolicy="no-referrer" />
            <script src="https://cdnjs.cloudflare.com/ajax/libs/twitter-bootstrap/2.3.2/js/bootstrap.min.js" integrity="sha512-28e47INXBDaAH0F91T8tup57lcH+iIqq9Fefp6/p+6cgF7RKnqIMSmZqZKceq7WWo9upYMBLMYyMsFq7zHGlug==" crossOrigin="anonymous" referrerPolicy="no-referrer"></script>
        </Head>

        <header>
            <img src="/images/logo.png" width={128} height={128} alt="logo" />
            <h1>Rick and Morty Maker</h1>
            <p>alpha</p>
        </header>

        <main>
            
            <div className={styles.twoCol}>
                <div>
                    <h4 className={styles.fname}>episode 1.tvscript</h4>
                    <Editor
                        height="500px"
                        className={styles.editor}
                        defaultLanguage="tvScript"
                        defaultValue={sampleScript}
                        theme='myCoolTheme'
                        onMount={handleEditorDidMount}
                        
                    />

                    <button className="btn btn-large" onClick={clickGenerate} disabled={generateStatus == 'generating'}>
                        {generateStatus == 'generating' && 'Generating'}
                        {generateStatus == null && 'Generate'}
                    </button>
                    <p>
                        {msg}
                    </p>
                </div>

                <div className={styles.preview}>
                    <video controls ref={videoRef}>
                        <source src={videoSrc} width="100%" height="100%" type="video/mp4" />
                        Your browser does not support the video tag.
                    </video>
                    <center>
                        <h4>Video preview</h4>
                    </center>
                </div>
            </div>
        </main>
    </div>
}

export default App;