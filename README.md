# Samuel Bahago Gabriel — GIS Portfolio

Professional portfolio covering GIS, remote sensing, hydrology, environmental planning and climate-resilience work in Nigeria.

## Published portfolio and studies

- [Professional GIS portfolio](https://bahagogabriel.github.io/gis-portfolio/) — eight project case studies
- [Niger Delta Gas-Flaring Evidence Atlas](https://bahagogabriel.github.io/niger-delta-gas-flaring-atlas/)
- [Bayelsa Oil-Spill Evidence Atlas](https://bahagogabriel.github.io/bayelsa-evidence-atlas/)
- [Anambra Erosion Prioritization Dashboard](https://bahagogabriel.github.io/anambra-erosion-dashboard/)
- [Lokoja Flood Resilience Dashboard](https://bahagogabriel.github.io/lokoja-flood-resilience-dashboard/)
- Repository: `bahagogabriel/gis-portfolio`
- Planned custom domain: `bahagogabriel.com` (not yet connected)

## Portfolio projects

1. Development of 20 Strategic Catchment Management Plans for Northern Nigeria
2. Niger Delta Gas-Flaring Evidence Atlas
3. Lokoja Flood Risk and Resilience Planning
4. Bayelsa Oil-Spill Evidence Atlas
5. Anambra Soil-Erosion Prioritization
6. Baseline Survey and Mapping of Project Sites in Kwara State
7. Mining-Induced Environmental Degradation Assessment
8. Plateau Flood Hazard, Vulnerability and Risk Assessment

The newer research case studies use editorial cover graphics, explicitly marked as illustrations rather than analytical maps. Each links to the corresponding published research platform for authoritative maps and data. The Nigeria–West Africa LULC system will be added only once its scientific and publication acceptance is complete.


## Edit the complete website using Pages CMS

Log in at <https://app.pagescms.org/> with GitHub and open `bahagogabriel/gis-portfolio` on `main`.

Under **Website Pages**, the five forms now manage the whole public site without modifying HTML:
- **Website Settings**: name, initials, job title, location, email, phone, LinkedIn, navigation labels, active CV PDF, project-page labels, and safe accent presets (green default, teal, blue).
- **Homepage**: hero text and portrait, headline facts, featured items, recent research links, working philosophy and contact introduction.
- **About Me**: biography, fieldwork photographs, values, education and calls to action.
- **Résumé and CV**: profile, skills, employment, education, qualifications and the download button.
- **Portfolio Catalogue**: introductory content, filter labels and contact invitation.

**Portfolio projects** remains the existing eight-project collection. To add another project after scientific acceptance, create a case study there, add a card/hero image and supply any external dashboard link. Then add it to **Homepage → Featured cards** or **Homepage → Research links** if desired.

To replace your résumé PDF, go to **Website Settings → Current CV (PDF)**, upload or choose a PDF in `downloads/`, and save the settings file. Both CV download links refer to that one path. The older PDF can remain as a recoverable backup.

Changes in Pages CMS commit to GitHub, triggering GitHub Pages deployment and the `Validate Jekyll portfolio and CMS content` workflow. If a change fails validation, revert the content commit through GitHub or the editor and check the corresponding workflow run. Keep copy and image filenames short and meaningful. Use relative `/projects/...` links for internal case studies and full `https://` URLs for external dashboards.

Design/layout source files and the custom-domain `CNAME` remain outside the no-code forms; the editor provides only the three supported colour presets. The scientific results in separate dashboards do not change when you edit this portfolio.


## Edit projects without coding

The repository includes `.pages.yml`, which provides a structured editor through Pages CMS.

1. Visit <https://app.pagescms.org/>.
2. Sign in with the GitHub account `bahagogabriel`.
3. Allow Pages CMS to access this repository.
4. Open **gis-portfolio**.
5. Select **Portfolio projects**.
6. Edit an existing project or create a new one.
7. Complete the form, upload project images and save.

Saving creates a normal GitHub commit. GitHub Pages then rebuilds the public website automatically.

## Repository structure

```text
_projects/        Editable project records
_layouts/         Reusable project-page design
_includes/        Shared navigation and footer
assets/           Maps, photographs and figures
downloads/        Downloadable CV
.pages.yml        Pages CMS form configuration
_config.yml       GitHub Pages and Jekyll configuration
```

## Initial GitHub Pages setup

After the first upload:

1. Open **Settings → Pages** in this repository.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select branch **main** and folder **/(root)**.
4. Save and wait for the first deployment.

Before connecting the custom domain, update `baseurl` in `_config.yml` from `/gis-portfolio` to an empty value and add the domain through **Settings → Pages**.

## Contact

- Email: Bahagogabriel@gmail.com
- LinkedIn: <https://www.linkedin.com/in/bahagogabriel>
- Location: Jos, Nigeria

