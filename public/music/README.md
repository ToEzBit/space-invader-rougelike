# Music files

The Void Empress's song lives here as `void-empress.ogg` and `void-empress.mp3`. It plays for her whole fight on stage 10, through both forms, and loops.

The `.ogg` is the one most browsers download. At 3.6 MB it is half the size of the 7.5 MB, 192 kbps `.mp3`. A browser whose `canPlayType` says it cannot play Ogg Vorbis, which may include Safari, skips the `.ogg` and downloads the `.mp3` instead.

Both files are built from the supplied song with the near-silence cut from each end, so the loop has no gap. The filter trims everything under -60 dBFS (any channel's peak) from the start, reverses the song, does the same, and reverses it back, keeping 5 ms at each end. To rebuild them after replacing the song, from a source file `song.mp3`:

```bash
TRIM='silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.005:detection=peak,areverse,silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.005:detection=peak,areverse'
ffmpeg -i song.mp3 -map_metadata -1 -vn -af "$TRIM" -c:a libmp3lame -b:a 192k void-empress.mp3
ffmpeg -i song.mp3 -map_metadata -1 -vn -af "$TRIM" -c:a libvorbis -q:a 3 void-empress.ogg
```

The current files were built this way from the untrimmed `void-empress.mp3` added in a569db9, so both are a second lossy generation. The mp3 encoder leaves this song about 0.3 dB quieter, which the game's level matching makes up. Quality 3 is a nominal 112 kbps, and this song averages 91 kbps at that setting. In Chrome both files decode to the same 13,760,592 samples, so neither codec adds a gap at the loop seam. Each starts with 4 ms and ends with 5 ms under -60 dBFS, where the untrimmed song had 148 ms and 975 ms.

The game downloads the song on the first key or tap, so it is on hand long before stage 10, and decodes it in the shop after stage 9. Decoded, it takes about 120 MB of memory, so it is not held through the earlier stages. A failed download or decode is retried 2, 4, 8, 16 and 32 s later, then every minute, up to 10 tries. If all 10 fail, stage 10 starts another 10 when it begins. While the latest try has failed, the Empress fights to Crimson Verdict and Crimson Verdict II. A later try that succeeds crossfades into the song, even mid-fight.

The game sets the song's level to match the other boss music, so it needs no volume editing.

The song is committed so that a deploy built from git, such as the Netlify site, plays it too. Without it in git the deployed game fell back to Crimson Verdict.
