import * as fs from 'fs';
import { glob } from 'glob';
import * as url from 'url';
import * as jschardet from "jschardet";
import * as iconv from "iconv-lite";

export function isPackageFileName(fileName: string): boolean {
    return !!fileName.match(/.{u}$/i);
}

// FIXME: Use glob pattern, and make the extension configurable.
export function isDocumentFileName(fileName: string): boolean {
    // Implied because we only receive one of the two.
    return !isPackageFileName(fileName);
}

/**
 * Scans a directory for any files that match the glob pattern.
 *
 * @param folderPath A path to the directory to search in.
 * @param pattern A glob pattern.
 * @returns An array of absolute paths of each file that did match the glob pattern.
 */
export function getFiles(folderPath: string, pattern: string): Promise<string[]> {
    return glob(pattern, {
        cwd: folderPath,
        nocase: true,
        nodir: true,
        absolute: true,
        ignore: 'node_modules/**'
    });
}

/**
 * Reads the text from the file system by URI.
 *
 * The URI will be converted to a file path if we are in a NodeJS environment.
 * This function is not safe, the file is presumed to exist and accessible.
 *
 * @returns the read file's text content.
 */
export function readTextByURI(uri: string): string {
    const filePath = url.fileURLToPath(uri);
    return readTextByPath(filePath);
}


export function readTextByPath(filePath:string):string {
    const buffer = fs.readFileSync(filePath);
    if (buffer.length === 0) {
        return "";
    }
    const encoding = jschardet.detect(buffer).encoding;
    if (!iconv.encodingExists(encoding)) {
        console.error(`Unsupport file encoding::${encoding} in file:${filePath}, fall back to UTF-8`)
        return iconv.decode(buffer,"utf8");
    }
    return iconv.decode(buffer,encoding);
}