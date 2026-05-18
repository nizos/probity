import { describe, expect, it } from 'vitest'

import { countNewTestNodes } from './count-new-test-nodes.js'
import { csharp } from './languages/csharp.js'
import { javascript } from './languages/javascript.js'
import { php } from './languages/php.js'
import { python } from './languages/python.js'
import { ruby } from './languages/ruby.js'
import { typescript } from './languages/typescript.js'

describe.each([
  ['typescript', typescript],
  ['javascript', javascript],
] as const)('countNewTestNodes (%s)', (_name, language) => {
  it('returns 1 when a single it() call is added', () => {
    const before = `describe('x', () => {})`
    const after = `describe('x', () => { it('a', () => {}) })`

    expect(countNewTestNodes(before, after, language)).toBe(1)
  })

  it('counts test() calls as test nodes', () => {
    const before = `describe('x', () => {})`
    const after = `describe('x', () => { test('a', () => {}) })`

    expect(countNewTestNodes(before, after, language)).toBe(1)
  })

  it('counts it.skip() as a test node', () => {
    const before = `describe('x', () => {})`
    const after = `describe('x', () => { it.skip('a', () => {}) })`

    expect(countNewTestNodes(before, after, language)).toBe(1)
  })

  it('counts it.only() as a test node', () => {
    const before = `describe('x', () => {})`
    const after = `describe('x', () => { it.only('a', () => {}) })`

    expect(countNewTestNodes(before, after, language)).toBe(1)
  })

  it('counts test.skip() as a test node', () => {
    const before = `describe('x', () => {})`
    const after = `describe('x', () => { test.skip('a', () => {}) })`

    expect(countNewTestNodes(before, after, language)).toBe(1)
  })

  it('counts test.only() as a test node', () => {
    const before = `describe('x', () => {})`
    const after = `describe('x', () => { test.only('a', () => {}) })`

    expect(countNewTestNodes(before, after, language)).toBe(1)
  })

  it('does not count a new describe() with no tests inside as a test node', () => {
    const before = ``
    const after = `describe('x', () => {})`

    expect(countNewTestNodes(before, after, language)).toBe(0)
  })

  it('returns 2 when two tests are added in a single change', () => {
    const before = `describe('x', () => {})`
    const after = `describe('x', () => { it('a', () => {}); it('b', () => {}) })`

    expect(countNewTestNodes(before, after, language)).toBe(2)
  })

  it('returns 0 when an existing test is modified but no test is added', () => {
    const before = `describe('x', () => { it('a', () => { expect(1).toBe(1) }) })`
    const after = `describe('x', () => { it('a renamed', () => { expect(2).toBe(2) }) })`

    expect(countNewTestNodes(before, after, language)).toBe(0)
  })

  it('returns 0 when only non-test code is added', () => {
    const before = ``
    const after = `function add(a, b) { return a + b }`

    expect(countNewTestNodes(before, after, language)).toBe(0)
  })

  it('counts test.each() as a single test node', () => {
    const before = `describe('x', () => {})`
    const after = `describe('x', () => { test.each([1, 2])('case %i', (n) => {}) })`

    expect(countNewTestNodes(before, after, language)).toBe(1)
  })

  it('counts it.each() as a single test node', () => {
    const before = `describe('x', () => {})`
    const after = `describe('x', () => { it.each([1, 2])('case %i', (n) => {}) })`

    expect(countNewTestNodes(before, after, language)).toBe(1)
  })

  it('counts it.todo() as a test node', () => {
    const before = `describe('x', () => {})`
    const after = `describe('x', () => { it.todo('a') })`

    expect(countNewTestNodes(before, after, language)).toBe(1)
  })

  it('counts test.todo() as a test node', () => {
    const before = `describe('x', () => {})`
    const after = `describe('x', () => { test.todo('a') })`

    expect(countNewTestNodes(before, after, language)).toBe(1)
  })

  it('counts xit() as a test node', () => {
    const before = `describe('x', () => {})`
    const after = `describe('x', () => { xit('a', () => {}) })`

    expect(countNewTestNodes(before, after, language)).toBe(1)
  })

  it('counts fit() as a test node', () => {
    const before = `describe('x', () => {})`
    const after = `describe('x', () => { fit('a', () => {}) })`

    expect(countNewTestNodes(before, after, language)).toBe(1)
  })

  it('counts xtest() as a test node', () => {
    const before = `describe('x', () => {})`
    const after = `describe('x', () => { xtest('a', () => {}) })`

    expect(countNewTestNodes(before, after, language)).toBe(1)
  })

  it('counts ftest() as a test node', () => {
    const before = `describe('x', () => {})`
    const after = `describe('x', () => { ftest('a', () => {}) })`

    expect(countNewTestNodes(before, after, language)).toBe(1)
  })

  it('counts it.failing() as a test node', () => {
    const before = `describe('x', () => {})`
    const after = `describe('x', () => { it.failing('a', () => {}) })`

    expect(countNewTestNodes(before, after, language)).toBe(1)
  })

  it('counts a deep chain like it.concurrent.skip.each() as a single test node', () => {
    const before = `describe('x', () => {})`
    const after = `describe('x', () => { it.concurrent.skip.each([1])('case %i', (n) => {}) })`

    expect(countNewTestNodes(before, after, language)).toBe(1)
  })

  it('does not count `it` from a named import as a test node', () => {
    const before = ``
    const after = `import { it } from 'vitest'`

    expect(countNewTestNodes(before, after, language)).toBe(0)
  })

  it('does not count a local `it` binding as a test node', () => {
    const before = ``
    const after = `const it = (name, fn) => fn()`

    expect(countNewTestNodes(before, after, language)).toBe(0)
  })

  it('does not count obj.it() where `it` is a property name', () => {
    const before = ``
    const after = `obj.it()`

    expect(countNewTestNodes(before, after, language)).toBe(0)
  })
})

describe('countNewTestNodes (python)', () => {
  it('counts a def test_*() function as a new test node', () => {
    const before = ``
    const after = `def test_addition():\n    assert 1 + 1 == 2\n`

    expect(countNewTestNodes(before, after, python)).toBe(1)
  })

  it('returns 0 when the language has no parser registered (peer-dep missing)', () => {
    const noParser = { name: 'fake', parser: undefined, patterns: [] }

    expect(
      countNewTestNodes(
        'def test_x(): pass',
        'def test_y(): pass\ndef test_z(): pass',
        noParser,
      ),
    ).toBe(0)
  })
})

describe('countNewTestNodes (csharp)', () => {
  it('counts a [Fact] method (xUnit) as a new test node', () => {
    const before = `public class Calc { }`
    const after = `public class Calc {
      [Fact]
      public void Adds() { }
    }`

    expect(countNewTestNodes(before, after, csharp)).toBe(1)
  })

  it('counts a [Theory] method (xUnit parameterised) as a new test node', () => {
    const before = `public class Calc { }`
    const after = `public class Calc {
      [Theory]
      [InlineData(1, 2)]
      public void Adds(int a, int b) { }
    }`

    expect(countNewTestNodes(before, after, csharp)).toBe(1)
  })

  it('counts a [Test] method (NUnit) as a new test node', () => {
    const before = `public class Calc { }`
    const after = `public class Calc {
      [Test]
      public void Adds() { }
    }`

    expect(countNewTestNodes(before, after, csharp)).toBe(1)
  })

  it('counts a [TestMethod] method (MSTest) as a new test node', () => {
    const before = `public class Calc { }`
    const after = `public class Calc {
      [TestMethod]
      public void Adds() { }
    }`

    expect(countNewTestNodes(before, after, csharp)).toBe(1)
  })
})

describe('countNewTestNodes (ruby)', () => {
  it('counts a single it() block (RSpec) as a new test node', () => {
    const before = `describe 'Calc' do\nend\n`
    const after = `describe 'Calc' do\n  it 'adds' do\n  end\nend\n`

    expect(countNewTestNodes(before, after, ruby)).toBe(1)
  })

  it('counts a specify() block (RSpec) as a new test node', () => {
    const before = `describe 'Calc' do\nend\n`
    const after = `describe 'Calc' do\n  specify 'adds' do\n  end\nend\n`

    expect(countNewTestNodes(before, after, ruby)).toBe(1)
  })

  it('counts an xit() block (RSpec skipped) as a new test node', () => {
    const before = `describe 'Calc' do\nend\n`
    const after = `describe 'Calc' do\n  xit 'adds' do\n  end\nend\n`

    expect(countNewTestNodes(before, after, ruby)).toBe(1)
  })

  it('counts a fit() block (RSpec focused) as a new test node', () => {
    const before = `describe 'Calc' do\nend\n`
    const after = `describe 'Calc' do\n  fit 'adds' do\n  end\nend\n`

    expect(countNewTestNodes(before, after, ruby)).toBe(1)
  })

  it('counts a def test_*() method (Minitest/Test::Unit) as a new test node', () => {
    const before = `class CalcTest\nend\n`
    const after = `class CalcTest\n  def test_addition\n  end\nend\n`

    expect(countNewTestNodes(before, after, ruby)).toBe(1)
  })

  it('returns 0 when an existing it() is renamed but no test is added', () => {
    const before = `describe 'Calc' do\n  it 'adds' do\n  end\nend\n`
    const after = `describe 'Calc' do\n  it 'adds two numbers' do\n  end\nend\n`

    expect(countNewTestNodes(before, after, ruby)).toBe(0)
  })

  it('returns 2 when two it() blocks are added in a single change', () => {
    const before = `describe 'Calc' do\nend\n`
    const after = `describe 'Calc' do\n  it 'adds' do\n  end\n  it 'subtracts' do\n  end\nend\n`

    expect(countNewTestNodes(before, after, ruby)).toBe(2)
  })

  it('does not count a new describe() block with no tests inside as a test node', () => {
    const before = ``
    const after = `describe 'Calc' do\nend\n`

    expect(countNewTestNodes(before, after, ruby)).toBe(0)
  })
})

describe('countNewTestNodes (php)', () => {
  it('counts a public function test_*() method (PHPUnit prefix) as a new test node', () => {
    const before = `<?php\nclass CalcTest {}\n`
    const after = `<?php\nclass CalcTest {\n  public function test_addition() {}\n}\n`

    expect(countNewTestNodes(before, after, php)).toBe(1)
  })

  it('counts a public function testFoo() camelCase method as a new test node', () => {
    const before = `<?php\nclass CalcTest {}\n`
    const after = `<?php\nclass CalcTest {\n  public function testAddition() {}\n}\n`

    expect(countNewTestNodes(before, after, php)).toBe(1)
  })

  it('counts a method with the #[Test] PHP 8 attribute as a new test node', () => {
    const before = `<?php\nclass CalcTest {}\n`
    const after = `<?php\nclass CalcTest {\n  #[Test]\n  public function it_adds() {}\n}\n`

    expect(countNewTestNodes(before, after, php)).toBe(1)
  })

  it('counts a method with the @test PHPDoc annotation as a new test node', () => {
    const before = `<?php\nclass CalcTest {}\n`
    const after = `<?php\nclass CalcTest {\n  /** @test */\n  public function it_adds() {}\n}\n`

    expect(countNewTestNodes(before, after, php)).toBe(1)
  })

  it('returns 0 when an existing test method is renamed but no test is added', () => {
    const before = `<?php\nclass CalcTest {\n  public function test_adds() {}\n}\n`
    const after = `<?php\nclass CalcTest {\n  public function test_adds_two_numbers() {}\n}\n`

    expect(countNewTestNodes(before, after, php)).toBe(0)
  })

  it('returns 2 when two test methods are added in a single change', () => {
    const before = `<?php\nclass CalcTest {}\n`
    const after = `<?php\nclass CalcTest {\n  public function test_adds() {}\n  public function test_subtracts() {}\n}\n`

    expect(countNewTestNodes(before, after, php)).toBe(2)
  })

  it('counts a method with both #[Test] and a test_ prefix only once', () => {
    const before = `<?php\nclass CalcTest {}\n`
    const after = `<?php\nclass CalcTest {\n  #[Test]\n  public function test_dual() {}\n}\n`

    expect(countNewTestNodes(before, after, php)).toBe(1)
  })

  it('does not count an empty class with no test methods as a test node', () => {
    const before = ``
    const after = `<?php\nclass CalcTest {}\n`

    expect(countNewTestNodes(before, after, php)).toBe(0)
  })

  it('does not count a #[DataProvider] attribute as a test node', () => {
    const before = `<?php\nclass CalcTest {}\n`
    const after = `<?php\nclass CalcTest {\n  #[DataProvider('cases')]\n  public function provideCases(): array { return []; }\n}\n`

    expect(countNewTestNodes(before, after, php)).toBe(0)
  })

  it('does not count a @testWith PHPDoc as a test node by itself', () => {
    const before = `<?php\nclass CalcTest {}\n`
    const after = `<?php\nclass CalcTest {\n  /** @testWith [1, 2] */\n  public function provideCases() {}\n}\n`

    expect(countNewTestNodes(before, after, php)).toBe(0)
  })
})
