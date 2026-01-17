# 🛡️ Repository Setup Guide

## **Manual GitHub Setup (Required)**

### **1. Branch Protection Rules**
Go to: Settings → Branches → Add branch protection rule

#### **main Branch Protection**
- ✅ **Branch name pattern**: `main`
- ✅ **Require pull request reviews before merging**
  - Required approving reviewers: 1
  - Dismiss stale PR approvals when new commits are pushed
- ✅ **Require status checks to pass before merging**
  - CI (from workflow file)
- ✅ **Require conversation resolution before merging**
- ✅ **Restrict pushes that create matching branches**
  - Include administrators: ❌ (ensures PR process)
  - Allow force pushes: ❌

#### **develop Branch Protection**
- ✅ **Branch name pattern**: `develop`
- ✅ **Require status checks to pass before merging**
  - CI (from workflow file)
- ✅ **Include administrators**: ✅ (for maintainers)
- ✅ **Allow force pushes**: ✅ (for cleanup)

### **2. Default Branch**
- Set `main` as default branch
- Configure `develop` as primary development branch in team conventions

### **3. Team Access**
- **Maintainers**: Push access to `develop`, PR to `main`
- **Contributors**: Fork, PR to `develop`
- **Bots**: Write access (for releases)

### **4. Issue Templates**
Create `.github/ISSUE_TEMPLATE/`:
- `bug_report.md` - Bug reports
- `feature_request.md` - New features
- `hotfix.md` - Emergency fixes

### **5. Pull Request Templates**
Create `.github/PULL_REQUEST_TEMPLATE.md`:
- Description requirements
- Checklist for testing
- Release notes format

### **6. Repository Settings**
- **Auto-delete head branches**: ✅
- **Allow squash merging**: ✅
- **Allow rebase merging**: ✅
- **Allow merge commits**: ❌ (encourage squash/rebase)

## **BRAT Configuration**

### **Stable Releases**
- **BRAT users**: Use repository URL → gets latest `main` branch
- **Pinned versions**: `https://github.com/ZachTish/TPS-Projects#v1.0.0`
- **Beta versions**: Use `develop` branch URL

### **Release Channels**
```
main    → Stable (recommended for most users)
develop  → Beta (for testing new features)
tags     → Specific versions (pinned releases)
```

## **Emergency Access**

### **If Branch Protection Blocks Critical Fix**
1. Temporarily disable branch protection (Settings → Branches)
2. Push hotfix directly to `main`
3. Re-enable protection immediately
4. Create follow-up PR to merge hotfix to `develop`

### **GitHub Repository Settings URL**
```
https://github.com/ZachTish/TPS-Projects/settings
```

## **Quality Gates**

### **Automated Checks**
- ✅ TypeScript compilation
- ✅ Code linting
- ✅ Manifest validation
- ✅ File size limits
- ✅ Security audit
- ✅ Secret scanning

### **Manual Checks**
- ✅ Review approval required
- ✅ Must pass CI checks
- ✅ No merge conflicts
- ✅ Documentation updated

## **Monitoring**

### **Key Metrics**
- Build success rate (CI)
- Time to merge PRs
- Release frequency
- Bug report response time

### **Alerts**
- Failed builds: Slack/email
- Security vulnerabilities: GitHub alerts
- Branch protection bypass: Admin notifications

This setup ensures:
🛡️ **Protected main branch**
🚀 **Automated releases**
🧪 **Quality checks**
🔄 **Smooth workflow**
🚨 **Emergency procedures**