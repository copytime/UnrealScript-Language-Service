import { NameHash } from 'UC/name';
import { UCLanguageSettings } from './UC/settings';

export enum EAnalyzeOption {
	None = "None",
	OnlyActive = "OnlyActive",
	All = "All"
}

export type UCLanguageServerSettings = UCLanguageSettings & {
    indexPackageExtensions?: string[];
    indexDocumentExtensions?: string[];
    indexAllDocuments?: boolean;
    indexDocumentDebouncePeriod: number;
    analyzeDocuments?: EAnalyzeOption;
    analyzeDocumentDebouncePeriod: number;
    ignoreUCObjectLiteralAnalyzerClassNames?: string[];
    ignoreTypeMatchClassNameMap?:Map<string,Set<string>[]>;
    _ignoreTypeMatchClassNameSets:string[][];
}
