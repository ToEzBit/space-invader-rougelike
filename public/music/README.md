# Music files

The Void Empress's song lives here as `void-empress.ogg` and `void-empress.mp3`. It plays for her whole fight on stage 10, through both forms, and loops.

The `.ogg` is the one most browsers download. At 3.6 MB it is half the size of the 7.5 MB, 192 kbps `.mp3`. A browser whose `canPlayType` says it cannot play Ogg Vorbis, which may include Safari, skips the `.ogg` and downloads the `.mp3` instead. The `.ogg` was transcoded from the `.mp3`, so it is a lossy copy of a lossy file. To rebuild it after replacing the song:

```bash
ffmpeg -i void-empress.mp3 -map_metadata -1 -vn -c:a libvorbis -q:a 3 void-empress.ogg
```

Quality 3 is a nominal 112 kbps, and this song averages 91 kbps at that setting. In Chrome both files decode to the same 13,809,664 samples, so neither codec adds a gap at the loop seam. The song itself starts with about 0.15 s and ends with about 1 s under -60 dBFS, and that quiet stretch is heard each time it loops.

The game downloads the song on the first key or tap, so it is on hand long before stage 10, and decodes it in the shop after stage 9. Decoded, it takes about 120 MB of memory, so it is not held through the earlier stages. A failed download or decode is retried 2, 4, 8, 16 and 32 s later, then every minute, up to 10 tries. While the latest try has failed, the Empress fights to Crimson Verdict and Crimson Verdict II. A later try that succeeds crossfades into the song, even mid-fight.

The game sets the song's level to match the other boss music, so it needs no volume editing.

The song is committed so that a deploy built from git, such as the Netlify site, plays it too. Without it in git the deployed game fell back to Crimson Verdict.
