# [Stretch3](https://stretch3.github.io/) への公開手順

## コードをGithubリポジトリに push して main ブランチにマージする

まずは通常通りローカルでビルドを行う。

```sh
npm install # bun install ではなく npm で install を行うこと
npm run build
```

build 後に dist/*.mjs の変更があれば `git commit -m "update mjs" dist` しておく。


build が通ったらローカルで stretch3 を起動してブラウザで動作確認を行う。

```sh
npm run start-stretch3
```

この確認を行う際は http://0.0.0.0:8601/ をブラウザで開いた後に必ず完全リロードを行うこと。
これを行わない場合以前開いた際に登録されたServiceWorkerによりブラウザに保存されている古いキャッシュが返されてしまう事がかなりの頻度で発生するためです。

動作確認に問題がなければ stretch3 サイトへの取り込み依頼に進みます。


## Github上の xcx-g2s の最新コミット（stretch3に取り込んで欲しいコミット）に `stretch3` タグを付けます。
まずは修正したコードが[Githubリポジトリ](https://github.com/tfabworks/xcx-g2s)に正しく反映されている事を確認します。

まだなら以下手順で push & main ブランチへの merge を行います。
- ローカル修正をcommitしたブランチを `git push`
- [xcx-g2sでPR](https://github.com/tfabworks/xcx-g2s/compare)を作成
- GithubのPRからmainブランチにマージ

Stretch3 では最新の xcx-g2s の変更を取り込むための再[デプロイ](https://github.com/stretch3/stretch3.github.io/blob/source/.github/workflows/deploy.yml#L42-L46)の際に `ref: stretch3` が指定されています。
そのため main ブランチを更新しただけでは Stretch3 側に修正が取り込まれる事はありません。
Stretch3 サイトへの反映依頼の前に、`stretch3` タグを移動しておく必要があります。

```sh
# 最新を fetch する（その際タグ情報も取得する）
git fetch --tags

# 既存の stretch3 タグを無視してカレントコミットにタグを移動するため -f を付ける
git tag -f stretch3 origin/main

# バージョン情報の tag も付けておきます
git tag "v$(npm pkg get version | perl -pe's/[^0-9\.]//g')"

# stretch3 タグをGithubにpushする（リモートの既存タグを上書きするので -f を付ける、この操作では stretch3 タグのみがpushされる）
git push -f origin stretch3
```

## [stretch3/stretch3.github.io] にPRを出す

大まかな流れは以下の通り
- [tfabworks/stretch3.github.io](https://github.com/tfabworks/stretch3.github.io)でREADME.mdを修正してcommit&pushする
- [stretch3/stretch3.github.io](https://github.com/stretch3/stretch3.github.io)に[PRを出す](https://github.com/stretch3/stretch3.github.io/compare/source...tfabworks:stretch3.github.io:source)
- PRが取り込まれると Github Actions の[デプロイフロー](https://github.com/stretch3/stretch3.github.io/blob/source/.github/workflows/deploy.yml)が実行されて https://stretch3.github.io/ に反映される


まずはフォークしたリポジトリをチェックアウトします。
```sh
git clone git@github.com:tfabworks/stretch3.github.io.git
cd stretch3.github.io
```

Fork元のコミットが進んでる場合はFork元と同期する
- Githubのサイト上で同期を行う場合
  - https://github.com/tfabworks/stretch3.github.io を開くと `Synk fork` というボタンがあるので差分がある場合はこれを押して同期する
  - 「Fork元リポジトリ](https://github.com/stretch3/stretch3.github.io) と `xxx commits` の数字が揃っていればOK
  - ローカルにチェックアウトしたディレクトリで `git rebase upstream/source` を実行する
- git コマンドで行う場合
```sh
# Fork元リポジトリを upstream という名前で remote に追加する
git remote add upstream https://github.com/stretch3/stretch3.github.io.git

# Fork元リポジトリの source ブランチを fetch する（sourceブランチに限定しないでfetchすると他のデカいブランチも取得してしまうので注意）
git fetch upstream source

# ローカルの source ブランチをFork元の最新にrebaseする
git rebase upstream/source
```

次にPR用のコミットを作成します。基本的には README.md を修正します。
修正内容は[過去のPR](https://github.com/stretch3/stretch3.github.io/pull/19/files)を真似ればよいです。
同じような修正（日付、バージョン情報、修正内容）を追記するなど。
修正したら commit して https://github.com/tfabworks/stretch3.github.io に push します。

以下URLからFork元に対してPRを作成します。
https://github.com/tfabworks/stretch3.github.io/compare

PRがマージされると https://stretch3.github.io/ に反映されます。

相手側の都合もあるので直ぐにマージされないかもしれません。

また取り込み後に動作不良などがある場合は修正依頼のメッセージが来ることもあるので適宜対応します。
