/* MRT Tracker website: the one setting.
   proxy: the address of your data relay (the Cloudflare Worker in worker/, see worker/README.md), with no "/" at
   the end. It holds the LTA key and passes on LTA alerts and crowds, rail news and the Live cam lookup.
   Leave it "" and the site still works: train times are estimates from the timetable and it says live data is
   unavailable. If the relay isn't on *.workers.dev, also add its address to connect-src in index.html
   (web/tools/make_web.py, CSP). */
window.MRT_WEB_CONFIG = {
  proxy: "https://mrt-relay.dannyiswandyy.workers.dev"
};
