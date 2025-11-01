const DEFAULT_PDF_FILENAME = 'leitner-statistiques.pdf';
const DEFAULT_PACKAGE_FILENAME = 'leitner-package.json';
const DEFAULT_SIGNATURE_SECRET = 'leitner-secret';

function escapePdfText(text) {
    return String(text).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildPdf(objects) {
    const header = '%PDF-1.4\n';
    let body = '';
    const xref = ['0000000000 65535 f '];
    let offset = header.length;

    objects.forEach((object, index) => {
        const objectNumber = index + 1;
        const objectBody = `${objectNumber} 0 obj\n${object}\nendobj\n`;
        body += objectBody;
        xref.push(`${offset.toString().padStart(10, '0')} 00000 n `);
        offset += objectBody.length;
    });

    const xrefOffset = offset;
    const trailer = `xref\n0 ${objects.length + 1}\n${xref.join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return header + body + trailer;
}

function buildStatisticsPdfContent({ title, overview, heatmap, durations, sessions, generatedAt }) {
    const lines = [];
    lines.push(`${title}`);
    lines.push('');
    lines.push('Résumé');
    lines.push(`Sessions: ${overview.sessions}`);
    lines.push(`Révisions: ${overview.reviews}`);
    lines.push(`Précision: ${overview.accuracy}%`);
    lines.push(`Durée totale: ${overview.duration}`);
    lines.push('');
    lines.push('Durées');
    lines.push(`Total: ${durations.total}`);
    lines.push(`Moyenne: ${durations.average}`);
    durations.perSession.forEach((session) => {
        lines.push(`${session.label}: ${session.duration}`);
    });
    lines.push('');
    lines.push('Chaleur (30 derniers jours)');
    heatmap.forEach((bucket) => {
        const label = bucket.label || bucket.date;
        lines.push(`${label} - ${bucket.sessions} session(s)`);
    });
    lines.push('');
    lines.push('Sessions détaillées');
    sessions.forEach((session) => {
        lines.push(`${session.date} - ${session.reviews ?? session.reviewed ?? 0} révisions (${session.accuracy}%)`);
    });
    lines.push('');
    lines.push(`Généré le: ${generatedAt}`);

    const text = lines.join('\n');
    const fontObject = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
    const contentLines = text.split('\n').map((line, index) => {
        if (index === 0) {
            return `(${escapePdfText(line)}) Tj`;
        }
        return `T* (${escapePdfText(line)}) Tj`;
    });
    const contentStream = `BT\n/F1 12 Tf\n14 TL\n72 760 Td\n${contentLines.join('\n')}\nET`;
    const content = `<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`;

    return buildPdf([
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
        content,
        fontObject
    ]);
}

function downloadBlob(blob, filename) {
    if (typeof window === 'undefined') {
        return null;
    }
    const link = window.document.createElement('a');
    const urlCreator = window.URL || window.webkitURL;
    if (!urlCreator?.createObjectURL) {
        console.warn('ImportExportService#downloadBlob nécessite URL.createObjectURL');
        return null;
    }
    link.href = urlCreator.createObjectURL(blob);
    link.download = filename;
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
    setTimeout(() => urlCreator.revokeObjectURL(link.href), 1000);
    return filename;
}

async function createHmac(message, secret = DEFAULT_SIGNATURE_SECRET) {
    if (!secret) {
        secret = DEFAULT_SIGNATURE_SECRET;
    }
    if (globalThis.crypto?.subtle) {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            'raw',
            encoder.encode(secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );
        const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
        const signatureArray = Array.from(new Uint8Array(signatureBuffer));
        return btoa(String.fromCharCode(...signatureArray));
    }
    return btoa(message.split('').reverse().join(''));
}

function encodePayload(payload) {
    if (typeof TextEncoder !== 'undefined') {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(JSON.stringify(payload));
        let binary = '';
        bytes.forEach((byte) => {
            binary += String.fromCharCode(byte);
        });
        return btoa(binary);
    }
    return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}

function decodePayload(encoded) {
    const binary = atob(encoded);
    if (typeof TextDecoder !== 'undefined') {
        const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
        const decoder = new TextDecoder();
        return JSON.parse(decoder.decode(bytes));
    }
    let escaped = '';
    for (let i = 0; i < binary.length; i += 1) {
        const code = binary.charCodeAt(i).toString(16).padStart(2, '0');
        escaped += `%${code}`;
    }
    return JSON.parse(decodeURIComponent(escaped));
}

export class ImportExportService {
    constructor(options = {}) {
        this.statisticsService = options.statisticsService || null;
        this.window = options.windowRef || (typeof window !== 'undefined' ? window : null);
        this.signatureSecret = options.signatureSecret || DEFAULT_SIGNATURE_SECRET;
    }

    async exportStatisticsToPDF(options = {}) {
        const { filename = DEFAULT_PDF_FILENAME, statistics = null, title = 'Statistiques Leitner' } = options;
        const stats = statistics || this.statisticsService?.getDashboardData?.();
        if (!stats) {
            throw new Error('Aucune statistique disponible pour l\'export PDF.');
        }
        const generatedAt = new Date().toLocaleString('fr-FR');
        const content = buildStatisticsPdfContent({
            title,
            overview: stats.overview,
            heatmap: stats.heatmap,
            durations: stats.durations,
            sessions: stats.sessions,
            generatedAt
        });
        const blob = new Blob([content], { type: 'application/pdf' });
        if (options.returnBlob) {
            return blob;
        }
        downloadBlob(blob, filename);
        return { filename, blob };
    }

    async sharePackageAsFile(options = {}) {
        const {
            packageData,
            filename = DEFAULT_PACKAGE_FILENAME,
            title = 'Partager un paquet Leitner',
            text = 'Voici un paquet Leitner à importer.'
        } = options;
        if (!packageData) {
            throw new Error('packageData est requis pour le partage.');
        }
        const serialized = JSON.stringify(packageData, null, 2);
        const blob = new Blob([serialized], { type: 'application/json' });
        if (this.window?.navigator?.share && typeof File !== 'undefined') {
            try {
                const file = new File([blob], filename, { type: 'application/json' });
                await this.window.navigator.share({ title, text, files: [file] });
                return { shared: true, via: 'navigator.share' };
            } catch (error) {
                console.warn('ImportExportService#sharePackageAsFile share failed', error);
            }
        }
        downloadBlob(blob, filename);
        return { shared: true, via: 'download' };
    }

    async sharePackageAsSignedUrl(options = {}) {
        const {
            packageData,
            expiresInMs = 1000 * 60 * 60,
            baseUrl = this.window?.location?.origin || '',
            secret = this.signatureSecret
        } = options;
        if (!packageData) {
            throw new Error('packageData est requis pour générer une URL signée.');
        }
        const payload = {
            data: packageData,
            expiresAt: Date.now() + expiresInMs
        };
        const encoded = encodePayload(payload);
        const signature = await createHmac(encoded, secret);
        const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        const url = `${normalizedBase}/#shared=${encodeURIComponent(encoded)}&sig=${encodeURIComponent(signature)}`;
        return { url, expiresAt: payload.expiresAt, signature };
    }

    async importFromSignedUrl(url, options = {}) {
        const secret = options.secret || this.signatureSecret;
        const parsedUrl = new URL(url, this.window?.location?.href || 'https://offline.local');
        const hash = parsedUrl.hash.replace(/^#/, '');
        const params = new URLSearchParams(hash);
        const encoded = params.get('shared');
        const signature = params.get('sig');
        if (!encoded || !signature) {
            throw new Error('URL signée invalide.');
        }
        const expectedSignature = await createHmac(encoded, secret);
        if (expectedSignature !== signature) {
            throw new Error('Signature invalide pour l\'URL fournie.');
        }
        const payload = decodePayload(encoded);
        if (payload.expiresAt && payload.expiresAt < Date.now()) {
            throw new Error('Le lien signé a expiré.');
        }
        return payload.data;
    }
}
