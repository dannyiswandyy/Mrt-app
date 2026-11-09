Singapore MRT Tracker — Android Dev App
A Singapore MRT/LRT tracking app focused on live train information, route/map visualisation, train model information, and Google travel-time comparison.
Current Features
🗺️ Singapore MRT/LRT network map
🚆 Live/available train information from the app's data sources
📍 Station search and station information
🚉 Train model information pages
🖼️ Train model photos with source attribution
🔎 Train/model details and service information
🌦️ Weather information
📰 Relevant transport/news information
🚌/🚆 Public-transport timing comparison
Google Maps/Routes comparison where configured
📹 Live camera functionality
🔄 App update checking
🛡️ API timeout/failure handling and cached-data fallback
📱 Android WebView-based interface with native Android integration
Train Model Information
The train model section can include model-specific photographs and information for Singapore rolling stock such as:
C151
C151B
C151C
C751B
R151
Other supported MRT/LRT rolling stock as the database expands
Train photographs are used for informational purposes and are attributed to their respective source websites. External images should not be downloaded, redistributed, or used commercially unless the relevant licence/permission allows it.
Stability
The dev build is designed to fail gracefully when an external API is unavailable.
Stability measures
Network requests have timeouts.
API failures do not intentionally block the main UI.
Loading states are released when requests fail.
Cached/previously loaded information can remain visible when a refresh fails.
Optional external services should not prevent the basic app interface from loading.
No fingerprint/integrity gate is used by the current dev build.
API Configuration
Google Maps Platform
Google Maps/Routes functionality may require a Google Cloud project, billing, and an API key depending on the Google service being used.
For GitHub Actions, store the key as a repository secret rather than committing it to the repository.
Recommended secret name:
GOOGLE_MAPS_API_KEY
Never commit API keys, passwords, tokens, or other credentials to Git.
OneMap / Location
The current stable dev build does not require OneMap or user-location services.
The app therefore does not require:
ONEMAP_EMAIL
ONEMAP_PASSWORD
user GPS permissions
This keeps the basic app independent of OneMap authentication and location APIs.
GitHub Actions
The repository uses GitHub Actions to build the Android application.
Typical workflow:
Push changes to GitHub.
Open the Actions tab.
Select the Android dev build workflow.
Start the workflow or wait for the configured trigger.
Download the generated APK from the workflow artifacts.
Security
Do not commit:
API keys
Google Cloud credentials
OneMap credentials
passwords
signing keys
keystores
private tokens
Use GitHub Actions Secrets for credentials required during a build.
Development Notes
The app contains a compressed/base64-encoded HTML asset inside the GitHub Actions workflow to keep the workflow file within GitHub's size limits.
The Android application provides native Java functionality to the WebView where required, including network/API integration and device-specific features.
The current development version intentionally avoids the previous JavaScript fingerprint/integrity mechanism so that legitimate code changes are not blocked by a stale fingerprint.
Testing
Before merging a workflow change, check:
YAML syntax
Embedded HTML extraction/decompression
JavaScript syntax
Android/Gradle build
Map rendering
Station search
Train information
Train model pages
External image loading/fallback
Google comparison
API timeout/failure behaviour
A successful static validation does not replace a real Android/Gradle build on the GitHub Actions runner.
Credits & Data Sources
This project may use information and imagery from Singapore transport and mapping sources, including:
Land Transport Authority (LTA)
SMRT
SBS Transit
SGTrains
Land Transport Guru
Google Maps Platform
All third-party trademarks, photographs, logos, and copyrighted material remain the property of their respective owners.
Disclaimer
This is a development project and should not be treated as an official LTA, SMRT, SBS Transit, or Google application.
Train locations, arrival information, route information, service status, and other live data may be delayed, incomplete, unavailable, or inaccurate.
Always verify important travel information with official transport sources.
License
Unless otherwise stated, the original source code in this repository is provided under the license specified by the repository owner.
Third-party data, photographs, APIs, trademarks, and other external content are not automatically covered by the project's source-code licence and remain subject to their respective terms and licences.
