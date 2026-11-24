#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
#  ProCut Downloader - one-time setup (Termux)
#  Engine: yt-dlp (hamesha latest) + ffmpeg
#  Istemal: kisi bhi app se video Share -> Termux
#           ya Termux mein:  dl <link>
#  Update: dlu
# ============================================================
echo ""
echo "=== ProCut Downloader setup shuru ==="
echo "2-3 minute lagein ge. Agar storage permission ka popup aye to ALLOW dabayein."
echo ""
termux-setup-storage
sleep 1
pkg update -y
pkg install -y python ffmpeg termux-api
pip install -U yt-dlp
mkdir -p "$HOME/bin" "$HOME/storage/downloads/ProCut-Downloads"

DLCMD='yt-dlp -f "bv*[height<=720]+ba/b[height<=720]/b" --merge-output-format mp4 --no-playlist --trim-filenames 80 -o "$HOME/storage/downloads/ProCut-Downloads/%(title)s.%(ext)s"'

# --- Share -> Termux : auto download ---
cat > "$HOME/bin/termux-url-opener" <<EOF
#!/data/data/com.termux/files/usr/bin/bash
echo ""
echo "Link mila: \$1"
echo "Download ho raha hai..."
$DLCMD "\$1"
echo ""
echo "=== HO GAYA - file Download/ProCut-Downloads folder mein hai ==="
echo "(ye window 6 second mein band ho jayegi)"
sleep 6
EOF
chmod +x "$HOME/bin/termux-url-opener"

# --- dl : manual link download ---
cat > "$PREFIX/bin/dl" <<EOF
#!/data/data/com.termux/files/usr/bin/bash
if [ -z "\$1" ]; then echo "Pehle link dein:  dl <video-ka-link>"; exit 1; fi
$DLCMD "\$1"
echo ""
echo "=== HO GAYA - Download/ProCut-Downloads folder dekhein ==="
EOF
chmod +x "$PREFIX/bin/dl"

# --- dla : sirf audio (MP3) ---
cat > "$PREFIX/bin/dla" <<EOF
#!/data/data/com.termux/files/usr/bin/bash
if [ -z "\$1" ]; then echo "Pehle link dein:  dla <video-ka-link>"; exit 1; fi
yt-dlp -x --audio-format mp3 --no-playlist --trim-filenames 80 -o "$HOME/storage/downloads/ProCut-Downloads/%(title)s.%(ext)s" "\$1"
echo ""
echo "=== AUDIO HO GAYA - Download/ProCut-Downloads folder dekhein ==="
EOF
chmod +x "$PREFIX/bin/dla"

# --- dlu : engine update ---
cat > "$PREFIX/bin/dlu" <<'EOF'
#!/data/data/com.termux/files/usr/bin/bash
pip install -U yt-dlp
echo "Engine update ho gaya."
EOF
chmod +x "$PREFIX/bin/dlu"

# --- Home screen button (Termux:Widget) ---
mkdir -p "$HOME/.shortcuts"
cat > "$HOME/.shortcuts/Video Download" <<'EOS'
#!/data/data/com.termux/files/usr/bin/bash
LINK=$(termux-clipboard-get 2>/dev/null | tr -d '\r\n')
case "$LINK" in
  http://*|https://*) ;;
  *) echo "Clipboard mein link nahi mila."
     printf "Link paste karke Enter dabayein: "
     read LINK ;;
esac
if [ -z "$LINK" ]; then echo "Link khaali hai - band kar raha hoon."; sleep 3; exit 1; fi
echo "Download ho raha hai: $LINK"
yt-dlp -f "bv*[height<=720]+ba/b[height<=720]/b" --merge-output-format mp4 --no-playlist --trim-filenames 80 -o "$HOME/storage/downloads/ProCut-Downloads/%(title)s.%(ext)s" "$LINK"
if [ $? -eq 0 ]; then
  echo ""
  echo "=== HO GAYA - file Download/ProCut-Downloads mein hai ==="
else
  echo ""
  echo "=== Download NAHI hua - link check karein, ya Termux mein pehle dlu chalayein ==="
fi
sleep 5
EOS
chmod +x "$HOME/.shortcuts/Video Download"


echo ""
echo "============================================"
echo "  SETUP MUKAMMAL - sab tayyar hai"
echo "============================================"
echo ""
echo "Istemal:"
echo "  1) Kisi bhi app (YouTube / TikTok / Facebook...) mein"
echo "     video ka SHARE dabayein aur TERMUX chunein -"
echo "     download khud shuru ho jayega."
echo "  2) Ya Termux mein likhein:   dl <link>"
echo "  3) Sirf awaz (MP3) chahiye to:  dla <link>"
echo "  4) Kabhi koi site band ho to pehle:  dlu"
echo ""
echo "Home screen button: pehle F-Droid se Termux:Widget aur Termux:API lagayein,"
echo "phir home screen par Widgets mein se Termux:Widget rakh kar Video Download chunein."
echo ""
echo "Videos phone ke Download/ProCut-Downloads folder mein aati hain -"
echo "wahan se ProCut mein load kar lein."
echo ""
