const TMDB_BASE_URL    = 'https://api.themoviedb.org/3';
const TMDB_ACCESS_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJhNzZlYTMzMDA2OGUxZTVmOGEyZTRiNjEwNzI5ZWMzNCIsIm5iZiI6MTc4NDMwMzgwMC44OTYsInN1YiI6IjZhNWE1MGI4YjQzYzUwNDk4YjMxZmViMCIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.pCkbOjp6IXFuYxF7KL35Acvo-G_oavkrcGuSIt1_d80';
const TMDB_HEADERS = {
    'Authorization': `Bearer ${TMDB_ACCESS_TOKEN}`,
    'Content-Type':  'application/json',
};

async function test() {
    const tmdbId = 1396; // Breaking Bad
    const url = `${TMDB_BASE_URL}/tv/${tmdbId}?language=fr-FR&append_to_response=watch/providers`;
    const response = await fetch(url, { headers: TMDB_HEADERS });
    const data = await response.json();
    console.log('WATCH PROVIDERS DATA FOR FR:');
    console.log(JSON.stringify(data['watch/providers']?.results?.FR, null, 2));
}

test();
