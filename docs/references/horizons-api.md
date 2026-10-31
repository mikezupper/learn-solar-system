# JPL Horizons API

`https://ssd.jpl.nasa.gov/api/horizons.api`. A public calculator running DE441. It sends no CORS headers,
so a browser cannot call it; only the worker does.

**The request the verifier sends:**

| Parameter | Value | Why |
|---|---|---|
| `format` | `json` | The table arrives as text inside `result` |
| `EPHEM_TYPE` | `'VECTORS'` | Positions, not sky coordinates |
| `COMMAND` | `'199'` | The body. `'4'` to `'8'` are barycenters |
| `CENTER` | `'500@10'` | The Sun's center. `'500@399'` is Earth's |
| `TLIST` | `'2461045.200000',...` | Julian dates |
| `TIME_TYPE` | `'TDB'` | The same clock as the kernels |
| `REF_PLANE` | `'FRAME'` | ICRF axes, the same as the kernels |
| `VEC_TABLE` | `'1'` | Position only |
| `OUT_UNITS` | `'KM-S'` | |
| `CSV_FORMAT` | `'YES'`, `VEC_LABELS` `'NO'` | Rows read `JD, date, X, Y, Z,` |

Rows sit between `$$SOE` and `$$EOE`. An answer with neither marker is an error message. A recorded answer
is in `fixtures/horizons/vectors-response.txt`.

**When comparing rotation, not positions:** observer tables report planetodetic latitudes, which differ
from planetocentric ones by up to 4 degrees on Saturn. They report west longitudes for most planets but
east for Venus, Uranus and Earth. Both cost a false alarm in the prototype.

No published rate limit was found. It is a shared public service, so requests go one at a time.
