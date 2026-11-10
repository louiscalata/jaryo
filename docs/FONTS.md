# Font licenses

The lab loads three families, Latin `woff2` only, from `assets/fonts/`. They are the faces named in `lab.css`. No other font files are shipped.

| Family | Role in Jaryo | License | Copyright | License file |
|---|---|---|---|---|
| IBM Plex Sans | Reading text and card titles | SIL Open Font License 1.1 | Copyright © 2017 IBM Corp. Reserved Font Name "Plex". | [OFL-IBM-Plex.txt](fonts/OFL-IBM-Plex.txt) |
| IBM Plex Mono | IDs, labels, spec lines, section titles | SIL Open Font License 1.1 | Copyright © 2017 IBM Corp. Reserved Font Name "Plex". | [OFL-IBM-Plex.txt](fonts/OFL-IBM-Plex.txt) |
| Libre Baskerville | Study serif only | SIL Open Font License 1.1 | Copyright 2012 Pablo Impallari and Rodrigo Fuenzalida. Reserved Font Name "Libre Baskerville". | [OFL-Libre-Baskerville.txt](fonts/OFL-Libre-Baskerville.txt) |

IBM Plex is one license covering Sans and Mono. Source: [IBM Plex](https://github.com/IBM/plex). Libre Baskerville source: [Impallari Libre Baskerville](https://github.com/impallari/Libre-Baskerville). The files in this repo are the Latin cuts published by Fontsource from those upstreams.

Baskerville, Didot, Futura, Antique Olive, Univers, Helvetica, Centaur, Calvert, Bodoni, and the other faces named in the Typography 1 booklet are not included. They are not free web fonts. Libre Baskerville is the transitional serif used where the booklet used Baskerville.

If the `woff2` files fail to load, the stacks fall back to generic `sans-serif`, `monospace`, and `serif`. Those fallbacks are not part of the licensed set.
