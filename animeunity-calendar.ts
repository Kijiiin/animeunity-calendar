/**
 * AnimeUnity Calendar for Seanime
 *
 * The native Seanime schedule intentionally tracks only the user's library.
 * This plugin adds a separate, read-only AnimeUnity release panel directly
 * to that screen, without reading or changing AniList data.
 */

type AnimeUnityAnime = {
    id: number | string;
    slug: string;
    title?: string;
    images?: {
        poster?: string | null;
    };
    variants?: Array<{
        language?: string;
    }>;
};

type AnimeUnityRelease = {
    anime?: AnimeUnityAnime;
    isDub?: boolean;
    releaseTime?: string;
    nextEpisodeNumber?: string | number;
    isLate?: boolean;
    isAired?: boolean;
    isNextAiring?: boolean;
};

type AnimeUnityCalendar = {
    [day: string]: AnimeUnityRelease[];
};

function init(): void {
    $ui.register((ctx) => {
        const panel = ctx.newWebview({
            slot: "schedule-screen-top",
            fullWidth: true,
            autoHeight: true
        });

        let calendar: AnimeUnityCalendar | null = null;
        let error = "";
        let loading = true;

        // Seanime runs the UI callback in a separate JavaScript runtime.
        // Keep every function used by setContent inside this callback so it
        // is available in that runtime as well.
        const escapeHtml = (value: string): string => value
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");

        const formatTime = (value?: string): string => {
            if (!value) {
                return "Orario non indicato";
            }

            const match = value.match(/T(\d{2}:\d{2})/);
            return match ? match[1] : value;
        };

        const renderRelease = (release: AnimeUnityRelease): string => {
            const anime = release.anime;
            const title = anime?.title || "Titolo non disponibile";
            const episode = release.nextEpisodeNumber
                ? `Ep. ${escapeHtml(String(release.nextEpisodeNumber))}`
                : "Nuovo episodio";
            const time = formatTime(release.releaseTime);
            const language = release.isDub ? "Doppiato ITA" : "Sub ITA";
            const state = release.isLate
                ? "In ritardo"
                : release.isAired
                    ? "Disponibile"
                    : release.isNextAiring
                        ? "Prossima uscita"
                        : "In programma";

            return `
                <article class="release">
                    <div class="title">${escapeHtml(title)}</div>
                    <div class="meta">
                        <span>${episode}</span>
                        <span>${escapeHtml(time)}</span>
                        <span>${language}</span>
                        <span class="state">${state}</span>
                    </div>
                </article>`;
        };

        const shell = (content: string, isHtml = false): string => {
            const body = isHtml
                ? content
                : `<p class="message">${content}</p>`;

            return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
        margin: 12px 0 4px;
        color: #e6eaf2;
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    .wrap {
        background: #151923;
        border: 1px solid #2b3342;
        border-radius: 12px;
        padding: 16px;
    }
    h2 { margin: 0 0 4px; font-size: 18px; }
    .subtitle { margin: 0 0 16px; color: #9da8ba; font-size: 13px; }
    .day { margin-top: 16px; }
    .day h3 { margin: 0 0 8px; color: #c9d5ea; font-size: 14px; }
    .releases { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 8px; }
    .release { padding: 10px; border-radius: 8px; background: #202737; }
    .title { overflow: hidden; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
    .meta { display: flex; flex-wrap: wrap; gap: 5px 9px; margin-top: 6px; color: #aeb9cb; font-size: 12px; }
    .state { color: #78d7a3; }
    .message { margin: 0; color: #aeb9cb; }
</style>
</head>
<body>
    <main class="wrap">
        <h2>Uscite AnimeUnity</h2>
        <p class="subtitle">Calendario completo di AnimeUnity.cx</p>
        ${body}
    </main>
</body>
</html>`;
        };

        const renderPanel = (
            source: AnimeUnityCalendar | null,
            isLoading: boolean,
            loadError: string
        ): string => {
            if (isLoading) {
                return shell("Caricamento delle uscite AnimeUnity…");
            }

            if (loadError) {
                return shell(
                    "Calendario AnimeUnity non disponibile: " +
                    escapeHtml(loadError)
                );
            }

            const days = Object.entries(source || {});

            if (days.length === 0) {
                return shell(
                    "AnimeUnity non ha comunicato uscite per questa settimana."
                );
            }

            const content = days.map(([label, releases]) => {
                const items = (releases || []).map(renderRelease).join("");

                return `
                    <section class="day">
                        <h3>${escapeHtml(label)}</h3>
                        <div class="releases">${items || "<p>Nessuna uscita.</p>"}</div>
                    </section>`;
            }).join("");

            return shell(content, true);
        };

        const loadCalendar = async (): Promise<void> => {
            loading = true;
            error = "";
            panel.update();

            try {
                const response = await ctx.fetch(
                    "https://animeunity.cx/api/calendar",
                    {
                        headers: {
                            Accept: "application/json, text/plain, */*"
                        }
                    }
                );

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const data = response.json<AnimeUnityCalendar>();

                if (!data || typeof data !== "object") {
                    throw new Error("Risposta non valida");
                }

                calendar = data;
            } catch (cause) {
                calendar = null;
                error = cause instanceof Error
                    ? cause.message
                    : "Impossibile contattare AnimeUnity.";
            } finally {
                loading = false;
                panel.update();
            }
        };

        panel.setContent(() => renderPanel(
            calendar,
            loading,
            error
        ));

        panel.onMount(() => {
            loadCalendar();
        });
    });
}
