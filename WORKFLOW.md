# TPS Plugins Development Workflow

## 🌳 Branch Structure

```
main (protected) ← Production releases only
├── develop (integration) ← Feature branches merge here
│   ├── feature/feature-name
│   ├── bugfix/bug-description
│   └── hotfix/emergency-fix
└── release/vX.X.X ← Release preparation
```

## 🚀 Workflow Rules

### **main Branch**
- ✅ **PROTECTED** - No direct pushes
- ✅ Only via Pull Request from `release/*` or `hotfix/*` branches
- ✅ Represents stable, released versions
- ✅ Always tagged with semantic version (v1.0.0, v1.1.0, etc.)

### **develop Branch**
- ✅ Integration branch for all features
- ✅ Feature branches merge into develop via PR
- ✅ Should always be buildable
- ✅ Represents next release version

### **Feature Branches**
- ✅ Named: `feature/description` or `bugfix/description`
- ✅ Branch from `develop`
- ✅ Merge back to `develop` via PR
- ✅ Delete after merge

### **Release Branches**
- ✅ Named: `release/vX.X.X`
- ✅ Branch from `develop` when ready for release
- ✅ Only bug fixes, no new features
- ✅ Merge to `main` (release) and `develop` (backfixes)

### **Hotfix Branches**
- ✅ Named: `hotfix/description`
- ✅ Branch from `main` for emergency fixes
- ✅ Merge to `main` (release) and `develop` (backfixes)

## 📋 Release Process

### **1. Prepare Release**
```bash
# From develop branch
git checkout -b release/v1.1.0 develop
# Update version numbers, changelog
git commit -m "chore: Prepare v1.1.0 release"
```

### **2. Complete Release**
```bash
# Merge to main
git checkout main
git merge --no-ff release/v1.1.0
git tag -a v1.1.0 -m "Release version 1.1.0"

# Merge back to develop
git checkout develop
git merge --no-ff release/v1.1.0

# Delete release branch
git branch -d release/v1.1.0
git push origin --delete release/v1.1.0
```

### **3. Hotfix (Emergency)**
```bash
# From main branch
git checkout -b hotfix/critical-bug main
# Fix the issue
git commit -m "fix: Critical security vulnerability"

# Merge to main
git checkout main
git merge --no-ff hotfix/critical-bug
git tag -a v1.1.1 -m "Hotfix version 1.1.1"

# Merge back to develop
git checkout develop
git merge --no-ff hotfix/critical-bug
```

## 🛡️ Branch Protection Rules

### **main Branch**
- ❌ No direct pushes
- ✅ Require pull request reviews
- ✅ Require status checks to pass
- ✅ Require conversation resolution
- ✅ Include administrators as reviewers

### **develop Branch**
- ✅ Allow direct pushes (for maintainers)
- ✅ Require PR reviews for contributors
- ✅ Require status checks to pass

## 🏷️ Version Management

### **Semantic Versioning**
- **MAJOR** (X.0.0) - Breaking changes
- **MINOR** (0.X.0) - New features, backward compatible
- **PATCH** (0.0.X) - Bug fixes, backward compatible

### **BRAT Compatibility**
- Each release tag creates a stable BRAT version
- Users can pin to specific tags: `https://github.com/user/repo#v1.0.0`
- Latest tag always available: `https://github.com/user/repo`

## 🔄 Development Commands

```bash
# Start new feature
git checkout develop
git pull origin develop
git checkout -b feature/new-feature

# Work on feature...
git add .
git commit -m "feat: Add new feature"

# Push and create PR
git push origin feature/new-feature
# Create PR: feature/new-feature → develop

# Start release
git checkout develop
git pull origin develop
git checkout -b release/v1.2.0

# Complete release
./scripts/release.sh v1.2.0
```

## 📝 Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `style:` - Code style changes
- `refactor:` - Code refactoring
- `test:` - Test additions/changes
- `chore:` - Build process, maintenance

## 🚨 Emergency Procedures

### **Critical Bug in Production**
1. Create hotfix branch from `main`
2. Fix the issue
3. Release immediately as patch version
4. Merge fix back to `develop`

### **Broken Build in main**
1. Immediately identify breaking commit
2. Create hotfix branch
3. Revert or fix the issue
4. Release patch version

## 📊 Quality Gates

- ✅ All tests must pass
- ✅ Code must build successfully
- ✅ No merge conflicts
- ✅ Documentation updated
- ✅ Version numbers updated
- ✅ Changelog updated