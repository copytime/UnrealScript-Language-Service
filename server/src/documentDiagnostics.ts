import { Diagnostic, DiagnosticSeverity, DiagnosticTag } from 'vscode-languageserver';

import { IDiagnosticNode, UnreachableDiagnostic } from './UC/diagnostics/diagnostic';
import { DocumentAnalyzer } from './UC/diagnostics/documentAnalyzer';
import { UCDocument } from './UC/document';

function diagnosticsFromNodes(nodes: IDiagnosticNode[]) {
    return nodes
        .map(node => {
            const diagnosticInfo = Diagnostic.create(
                node.range,
                node.toString(),
                undefined,
                undefined,
                'unrealscript'
            );
            if (node instanceof UnreachableDiagnostic) {
                diagnosticInfo.severity = DiagnosticSeverity.Hint;
                diagnosticInfo.tags = [DiagnosticTag.Unnecessary,...diagnosticInfo.tags??[]];
            }
            return diagnosticInfo;
        });
}

export function getDocumentDiagnostics(document: UCDocument): Diagnostic[] {
    const diagnoser = new DocumentAnalyzer(document);
    document.accept(diagnoser);
    const diagnostics = diagnoser.getDiagnostics();
    return diagnosticsFromNodes(document.nodes).concat(diagnostics.toDiagnostic());
}
