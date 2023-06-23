import * as fs from "fs";
import * as path from "path";
import * as vscode from 'vscode';
import { exec } from 'child_process';
import { GitExtension, Repository } from './git';

let LastCommits = 0;
let IsGitEventStarted = false;

const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git');

export async function activate(context: vscode.ExtensionContext) {

  // Start Git Event
  startGitCommitEvent()

  // Send an Notification to the User to setup the Git Account Credentials
  const AccountCredentialsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data.json'), { encoding: 'utf8' }));

  if (AccountCredentialsData) {
    if (!AccountCredentialsData.name || !AccountCredentialsData.email) {
      const NotifySelection = await vscode.window.showInformationMessage('Please setup your Git Account Credentials', 'Setup');
      
      if (NotifySelection == 'Setup') {
        vscode.commands.executeCommand('auto-commit.setupGitAccount');
      };
    };
  } else {
    vscode.window.showErrorMessage('Failed to ópen the data in the json file! Please try again.');
  };

  // Setup Git Account Command
  let SetupGitAccountCommand = vscode.commands.registerCommand('auto-commit.setupGitAccount', async () => {

    // Git Name
    const AutoCommitInputName = await vscode.window.showInputBox({
        ignoreFocusOut: true,
        title: "Auto Commit Config 1/2",
        placeHolder: "Please enter your Git Account Name e.g. Joe Doe",
        prompt: "Typos may cause unwanted bugs",
      });

      if (AutoCommitInputName === '') return vscode.window.showErrorMessage('You did not enter an account name!');

      // Git Email
      const AutoCommitInputEmail = await vscode.window.showInputBox({
        ignoreFocusOut: true,
        title: "Auto Commit Config 2/2",
        placeHolder: "Please enter your Git Account Email e.g. joe@joe-doe.com",
        prompt: "Use your Git Remote E-Mail (GitHub, Azure DevOps...)",
      });

      if (AutoCommitInputEmail === '') return vscode.window.showErrorMessage('You did not enter an account email!');

      // Check E-Mail Validity
      if (!AutoCommitInputEmail?.match(/^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/)) return vscode.window.showErrorMessage('You did not enter an valid email address!');
      
      // Loading Indicator
      vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Setting up the auto commit account information...",
        cancellable: false
      }, (progress, token) => {
        const p = new Promise<void>(resolve => {
          setTimeout(() => resolve(), 5000);
        });
        return p;
      });

      // Save Git Account Credentials
      const AccountCredentialsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data.json'), { encoding: 'utf8' }));

      if (AccountCredentialsData) {
        AccountCredentialsData.name = AutoCommitInputName;
        AccountCredentialsData.email = AutoCommitInputEmail;
        fs.writeFileSync(path.join(__dirname, 'data.json'), JSON.stringify(AccountCredentialsData));
      } else {
        vscode.window.showErrorMessage('Failed to store the data in the json file! Please try again.');
      };
  });

  // Command to set the current git account
  let SetGitAccount = vscode.commands.registerCommand('auto-commit.applyWithConfig', async () => {
    setGitAccount(); 
    
    // Loading Indicator
    vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "Setting up the git account information...",
      cancellable: false
    }, (progress, token) => {
      const p = new Promise<void>(resolve => {
        setTimeout(() => resolve(), 2500);
      });
      return p;
    });
  });

  // About Command
  let AboutCommand = vscode.commands.registerCommand('auto-commit.about', async () => {
      const NotifySelection = await vscode.window.showInformationMessage('❤️ Thank you to use my extension', 'Repository', 'Creator');
      
      if (NotifySelection == 'Repository') {
          vscode.env.openExternal(vscode.Uri.parse("https://github.com/Tuncion/vscode-auto-user-commit"));
      } else if (NotifySelection == 'Creator') {
          vscode.env.openExternal(vscode.Uri.parse("https://github.com/Tuncion"));
      };
  });

  context.subscriptions.push(SetupGitAccountCommand, SetGitAccount, AboutCommand);
};

async function setGitAccount() {
  const AccountCredentialsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data.json'), { encoding: 'utf8' }));
  if (!AccountCredentialsData) return vscode.window.showErrorMessage('Failed to open the data in the json file! Please try again.');
  if (!AccountCredentialsData.name || !AccountCredentialsData.email) return vscode.window.showErrorMessage('Please setup your Git Account Credentials!');

  const GitUsernameCommand = await executeCommand(`git config --global user.name "${AccountCredentialsData.name}"`);
  const GitEmailCommand = await executeCommand(`git config --global user.email "${AccountCredentialsData.email}"`);
  const GitRewriteLastCommit = await executeCommand(`git commit --amend --reset-author --no-edit`);

  // Throw an Error if the Commands failed
  if (!GitUsernameCommand) return vscode.window.showErrorMessage('Failed to set the git username!');
  if (!GitEmailCommand) return vscode.window.showErrorMessage('Failed to set the git email!');
  if (!GitRewriteLastCommit) return vscode.window.showErrorMessage('Failed to rewrite the last commit to the current account!');
};

function executeCommand(command: string) {
  return new Promise(async (resolve, reject) => {

    // If gitExtension is unavailable
    if (!gitExtension) return reject();

    const git = gitExtension.exports.getAPI(1);
    const repository = git.repositories[0];
    const repoPath = repository.rootUri.fsPath;

    exec(command, { cwd: repoPath }, (error, stdout, stderr) => {
      if (error) {
        reject();
      };
      if (stderr) {
        reject();
      };
      resolve(true);
    });
  });
};

async function startGitCommitEvent() {
  if (gitExtension && !IsGitEventStarted) {
    const git = gitExtension.exports.getAPI(1);
    const repositories = git.repositories;

    // If no Repositories found, try again in 250ms
    if (repositories.length === 0) {
      setTimeout(() => startGitCommitEvent(), 250);
      return;
    } else {
      IsGitEventStarted = true;
    }

    repositories.forEach(async (repository) => {
      repository.state.onDidChange(async (e) => {
        const currentCommits = await getCommitCount();
        if (LastCommits === currentCommits) return;
        await setGitAccount();
        LastCommits = currentCommits;
      });

      // Set the initial commit count
      LastCommits = await getCommitCount();
    });
  } else {
    // If gitExtension is unavailable, try again in 250ms
    setTimeout(() => startGitCommitEvent(), 250);
  };
};

// get Commit Count
function getCommitCount(): Promise<number> {

  // If gitExtension is unavailable
  if (!gitExtension) return Promise.reject('gitExtension is unavailable');

  // Get the git API
  const git = gitExtension.exports.getAPI(1);
  const repositories = git.repositories;

  if (repositories.length === 0) {
    return Promise.reject('No Git repositories found');
  }

  const commitCountPromises = repositories.map(repository => {
    const repoPath = repository.rootUri.fsPath;
    return new Promise<number>((resolve, reject) => {
      exec(`git rev-list --count HEAD`, { cwd: repoPath }, (error, stdout, stderr) => {
        if (error) {
          reject(`Error while executing git command: git rev-list --count HEAD\n${stderr}`);
        } else {
          const commitCount = parseInt(stdout.trim(), 10);
          resolve(commitCount);
        }
      });
    });
  });

  return Promise.all(commitCountPromises)
    .then(commitCounts => commitCounts.reduce((total, count) => total + count, 0));
};

export function deactivate() {}