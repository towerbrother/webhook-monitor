# 🤖 Starting Ralph (Explained Like You're 5)

Hi! Let me explain how to start Ralph, the robot that writes code for you!

---

## 🎯 What is Ralph?

Ralph is like a robot friend who:

- Reads a list of things to build (like a to-do list)
- Picks one thing from the list
- Builds it
- Tests it to make sure it works
- Saves it (makes a "commit")
- Goes to sleep and wakes up fresh to do the next thing

---

## 🚀 Step-by-Step: Starting Ralph

### **Step 1: Open Your Terminal** 🖥️

On your computer, open the "terminal" (it's like a text messaging app for talking to your computer).

On Windows:

- Press `Windows Key + R`
- Type `cmd` and press Enter

Or use Git Bash, PowerShell, or Windows Terminal.

---

### **Step 2: Go to the Right Folder** 📁

Type this command and press Enter:

```bash
cd C:\Users\th-g.torre\Desktop\Repos\webhook-monitor
```

This tells your computer: "Hey, go to the webhook-monitor folder!"

You can check you're in the right place by typing:

```bash
pwd
```

It should say: `C:\Users\th-g.torre\Desktop\Repos\webhook-monitor`

---

### **Step 3: First Time Setup** 🎨

**This step only needs to happen ONCE, ever!**

Think of this like setting up a new toy before you can play with it.

Type this command:

```bash
./plans/ralph-init.sh
```

Then press Enter.

**What will happen:**

Ralph will wake up and:

- Create a special branch called `ralph/autonomous` (this is Ralph's workspace!)
- Check if everything is installed
- Make sure all the tests pass
- Create helper files
- Make a special "starting point" commit

**This takes about 5-10 minutes.**

When it's done, you'll see: "Initialization complete!"

**Important:** Ralph will work on a branch called `ralph/autonomous`. All 37 features will be built on this branch, then merged to `main` at the very end!

---

### **Step 4: Test With One Iteration** 🧪

Before letting Ralph run by himself for a long time, let's watch him do just ONE thing.

Type this:

```bash
./plans/ralph-once.sh
```

**What will happen:**

Ralph will:

1. Wake up
2. Read the to-do list (prd.json)
3. Pick ONE thing to build
4. Build it
5. Test it
6. Make a commit
7. Go to sleep

You can watch what Ralph is doing! When he's done, check:

```bash
git log -1
```

This shows you what Ralph just built! Cool, right?

---

### **Step 5: Let Ralph Run on His Own** 🏃‍♂️

Now that you've seen Ralph work once, you can let him do MANY things while you go get a snack!

Type this:

```bash
./plans/ralph.sh 20
```

This means: "Ralph, please do 20 things from the to-do list!"

**What will happen:**

1. Ralph wakes up
2. Ralph does the cycle 20 times (or until everything is done):
   - Read to-do list
   - Pick one thing
   - Build it
   - Test it
   - Save it (commit)
   - Wake up fresh and do the next thing
3. When Ralph is done (or after 20 rounds), he tells you!

**This might take a few hours**, depending on how hard the tasks are.

You'll see a file appear: `logs/ralph-20260227-HHMMSS.log`

This is like Ralph's diary - it writes down everything he did!

---

### **Step 6: Check What Ralph Did** 🔍

After Ralph is done, you can see what he built:

```bash
git log --oneline -20
```

This shows the last 20 commits Ralph made on the `ralph/autonomous` branch!

You can also read his diary:

```bash
cat plans/progress.txt
```

This shows EVERYTHING Ralph did, with details!

**Important:** All of Ralph's work stays on the `ralph/autonomous` branch. When ALL 37 features are done, Ralph will create ONE big pull request to merge everything to `main` at once!

---

## 🎨 The Files Explained (Like Toys in a Toy Box)

| File                      | What It Is                                  |
| ------------------------- | ------------------------------------------- |
| **`plans/prd.json`**      | The to-do list (37 things to build)         |
| **`plans/progress.txt`**  | Ralph's diary (what he did)                 |
| **`plans/ralph-init.sh`** | Setup toy (run once)                        |
| **`plans/ralph-once.sh`** | Make Ralph do ONE thing (for testing)       |
| **`plans/ralph.sh`**      | Make Ralph do MANY things (autonomous mode) |
| **`logs/`**               | Ralph's detailed diary folder               |

---

## 🛑 How to Stop Ralph

If Ralph is running and you want to stop him:

1. Press `Ctrl + C` on your keyboard (hold Ctrl, then press C)
2. Ralph will stop after he finishes the current thing

---

## 🐛 What If Something Goes Wrong?

### **Ralph says "ERROR: Docker not found"**

You need to install Docker Desktop:

1. Go to https://docs.docker.com/desktop/install
2. Download Docker Desktop
3. Install it
4. Restart your computer
5. Try again!

### **Ralph is stuck (not doing anything)**

1. Press `Ctrl + C` to stop him
2. Check what's wrong:
   ```bash
   pnpm test
   ```
3. If tests are failing, Ralph can't continue
4. Fix the tests (or ask for help)
5. Try again!

### **Ralph made a mistake**

You can undo Ralph's last thing:

```bash
git revert HEAD
```

This is like hitting "undo" in a video game!

---

## 📊 Watching Ralph Work

While Ralph is working, you can open another terminal and check:

**What is Ralph doing right now?**

```bash
tail -f logs/ralph-*.log
```

**How many things are left?**
Open `plans/prd.json` in a text editor and count how many have `"passes": false`

**What did Ralph just finish?**

```bash
git log -1
```

---

## 🎉 When Ralph Finishes Everything

When ALL 37 things are done, Ralph will:

1. Push the `ralph/autonomous` branch to GitHub
2. Create ONE big pull request with all 37 features
3. Say:
   ```
   <promise>COMPLETE</promise>
   SUCCESS: PRD complete!
   ```

That means Ralph built EVERYTHING on the to-do list! 🎊

Now you (or a teammate) can:

- Review all the code on GitHub
- Test it to make sure everything works
- Merge the pull request to put all 37 features into `main`

---

## 🆘 Need Help?

If you get stuck:

1. Read the log files in `logs/`
2. Check `plans/progress.txt` to see what Ralph was trying to do
3. Run `git status` to see what changed
4. Ask a human for help! 🙋

---

**That's it! You're ready to start Ralph!** 🚀

Remember:

1. `./plans/ralph-init.sh` (first time only)
2. `./plans/ralph-once.sh` (test one thing)
3. `./plans/ralph.sh 20` (let Ralph do 20 things)

Have fun! 🎉
