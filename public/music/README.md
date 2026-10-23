# Music files

Drop the Void Empress's song here as `void-empress.ogg` or `void-empress.mp3`. It plays for her whole fight on stage 10, through both forms, and loops. The game tries the `.ogg` first. Prefer it, since an MP3 encoder pads the start and end with silence and the loop then has a gap.

The game sets the song's level to match the other boss music, so it needs no volume editing. Until a file is here, or if it cannot be decoded, she fights to Crimson Verdict and Crimson Verdict II.

The song is committed so that a deploy built from git, such as the Netlify site, plays it too. Without it in git the deployed game fell back to Crimson Verdict.
