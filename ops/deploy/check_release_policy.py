#!/usr/bin/env python3
"""Fail closed before signing/deployment if GitHub environment approvals are absent.

Read-only API: https://docs.github.com/en/rest/deployments/environments#get-an-environment
"""
import json
import os
import sys
from urllib.parse import quote
from urllib.request import Request, urlopen


def validate(value, name):
    rules=value.get('protection_rules',[])
    review=next((rule for rule in rules if rule.get('type')=='required_reviewers'),{})
    if not review.get('reviewers') or review.get('prevent_self_review') is not True:
        raise ValueError(name+' requires reviewers and prevention of self review')
    policy=value.get('deployment_branch_policy') or {}
    if not (policy.get('protected_branches') or policy.get('custom_branch_policies')):
        raise ValueError(name+' requires deployment branch/tag restrictions')


def main():
    repository=os.environ['GITHUB_REPOSITORY']
    token=os.environ['GH_TOKEN']
    api=os.environ.get('GITHUB_API_URL','https://api.github.com')
    if not api.startswith('https://'): raise ValueError('GitHub API must use HTTPS')
    for name in sys.argv[1:]:
        request=Request(f'{api}/repos/{repository}/environments/{quote(name,safe="")}',
            headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'})
        with urlopen(request,timeout=30) as response: validate(json.load(response),name)
        print(name+': required approval and ref restrictions verified')


if __name__=='__main__':
    try: main()
    except Exception:
        # Never dump HTTP bodies, authentication headers or token-bearing request objects.
        print('Release protection could not be verified. Configure protected environments and Actions read access.',file=sys.stderr)
        sys.exit(2)
